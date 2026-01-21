import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") as string;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  // If webhook secret is not configured, skip signature verification (for testing)
  // In production, ALWAYS configure STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.warn("STRIPE_WEBHOOK_SECRET not configured - skipping signature verification");
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch (err) {
      console.error("Failed to parse webhook body:", err.message);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }
  } else {
    try {
      event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
    }
  }

  console.log("Received event:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancelled(subscription);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only handle subscription renewals (not initial payments)
        if (invoice.billing_reason === "subscription_cycle") {
          await handleSubscriptionRenewal(invoice);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { product, startup_id } = session.metadata || {};
  
  console.log("Processing checkout complete:", { product, startup_id, sessionId: session.id });

  // Record the payment
  const { error: paymentError } = await supabase.from("payments").insert({
    stripe_session_id: session.id,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: session.subscription as string,
    product: product,
    amount: session.amount_total,
    currency: session.currency,
    status: "completed",
    startup_id: startup_id || null,
  });

  if (paymentError) {
    console.error("Error recording payment:", paymentError);
  } else {
    console.log("Payment recorded successfully");
  }

  // Update startup based on product type
  if (product === "premium" && startup_id) {
    // Premium launch/upgrade - set is_live to true and plan to premium
    // Reset notification_sent so they get a new "you're live" email
    const { error } = await supabase
      .from("startups")
      .update({ 
        is_live: true, 
        plan: "premium",
        launch_date: new Date().toISOString().split('T')[0],
        notification_sent: false,
        notification_sent_at: null
      })
      .eq("id", startup_id);

    if (error) {
      console.error("Error updating startup for premium:", error);
    } else {
      console.log("Startup set to live with premium plan:", startup_id);
    }
  } else if (product === "featured" && startup_id) {
    // Featured spot - set plan to featured with 1 week duration
    // Reset notification_sent so they get a new "you're live" email
    const featuredUntil = new Date();
    featuredUntil.setDate(featuredUntil.getDate() + 7); // 1 week subscription
    
    const { error } = await supabase
      .from("startups")
      .update({ 
        plan: "featured",
        is_live: true,
        featured_until: featuredUntil.toISOString(),
        launch_date: new Date().toISOString().split('T')[0],
        notification_sent: false,
        notification_sent_at: null
      })
      .eq("id", startup_id);

    if (error) {
      console.error("Error updating startup for featured:", error);
    } else {
      console.log("Startup set to featured until:", featuredUntil.toISOString(), "startup_id:", startup_id);
    }
  } else if (product === "featured") {
    // Featured spot without startup_id - just log for manual handling
    console.log("Featured spot purchased without startup_id, customer:", session.customer_email);
  }
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  console.log("Subscription cancelled:", subscription.id);
  
  // Find the payment record and update status
  const { data: payment } = await supabase
    .from("payments")
    .select("startup_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (payment?.startup_id) {
    // Downgrade from featured to regular and clear featured_until
    const { error } = await supabase
      .from("startups")
      .update({ plan: "free", featured_until: null })
      .eq("id", payment.startup_id);

    if (error) {
      console.error("Error downgrading startup:", error);
    } else {
      console.log("Startup downgraded from featured:", payment.startup_id);
    }
  }

  // Update payment status
  await supabase
    .from("payments")
    .update({ status: "cancelled" })
    .eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
  console.log("Processing subscription renewal:", invoice.subscription);
  
  // Find the payment record to get the startup_id
  const { data: payment } = await supabase
    .from("payments")
    .select("startup_id, product")
    .eq("stripe_subscription_id", invoice.subscription as string)
    .single();

  if (payment?.startup_id && payment.product === "featured") {
    // Extend featured_until by another week
    const featuredUntil = new Date();
    featuredUntil.setDate(featuredUntil.getDate() + 7);
    
    const { error } = await supabase
      .from("startups")
      .update({ featured_until: featuredUntil.toISOString() })
      .eq("id", payment.startup_id);

    if (error) {
      console.error("Error extending featured period:", error);
    } else {
      console.log("Featured period extended until:", featuredUntil.toISOString(), "startup_id:", payment.startup_id);
    }

    // Record the renewal payment
    await supabase.from("payments").insert({
      stripe_session_id: invoice.id,
      stripe_customer_id: invoice.customer as string,
      stripe_subscription_id: invoice.subscription as string,
      product: "featured_renewal",
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: "completed",
      startup_id: payment.startup_id,
    });
  }
}
