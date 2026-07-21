import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Required for webhook signature verification in Deno runtime
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") as string;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Webhook signature verification is mandatory. The previous fallback that
  // parsed unsigned bodies when STRIPE_WEBHOOK_SECRET was missing meant any
  // public POST could mark a startup paid+live. Fail closed instead.
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured — refusing to process webhook");
    return new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("Missing stripe-signature header");
    return new Response(
      JSON.stringify({ error: "Missing signature" }),
      { status: 400 }
    );
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
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

  console.log("Processing checkout complete:", {
    product,
    startup_id,
    sessionId: session.id,
    payment_status: session.payment_status,
    status: session.status
  });

  // CRITICAL: Only process if payment was actually completed
  // This prevents upgrades when users just visit checkout without paying
  if (session.payment_status !== 'paid') {
    console.log("Payment not completed, skipping upgrade. Payment status:", session.payment_status);
    return;
  }

  if (session.status !== 'complete') {
    console.log("Session not complete, skipping upgrade. Status:", session.status);
    return;
  }

  // Get the actual payment completion date from the session
  // Use the current timestamp (when webhook is received) as this is when payment completed
  // Convert to PST date string for launch_date
  const now = new Date();
  const paymentDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const paymentTimestamp = now.toISOString();

  console.log("Payment completed at:", paymentTimestamp, "PST date:", paymentDate);

  // Idempotency: Stripe can retry or duplicate webhook deliveries. If this
  // checkout session was already recorded, stop now — otherwise a retry would
  // insert the same paid startup twice.
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existingPayment) {
    console.log("Checkout session already processed, skipping:", session.id);
    return;
  }

  // For NEW paid launches, the client sends the full submission in metadata and
  // does NOT pre-create a row. Now that payment is confirmed, create it. For
  // dashboard upgrades, startup_id is present and we fall through to the
  // existing update paths below.
  let effectiveStartupId: string | null = startup_id || null;
  let insertedNewStartup = false;
  let insertedLaunchDate = paymentDate;

  if (!effectiveStartupId && session.metadata?.sub === "1") {
    // Throw on failure so Stripe retries — never silently drop a paid launch.
    const result = await insertPaidStartupFromMetadata(
      session,
      product as string,
      paymentDate,
      paymentTimestamp
    );
    effectiveStartupId = result.id;
    insertedLaunchDate = result.launchDate;
    insertedNewStartup = true;
    console.log("Inserted new paid startup from metadata:", effectiveStartupId, "launch_date:", insertedLaunchDate);
  }

  // Record the payment
  const { error: paymentError } = await supabase.from("payments").insert({
    stripe_session_id: session.id,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: session.subscription as string,
    product: product,
    amount: session.amount_total,
    currency: session.currency,
    status: "completed",
    startup_id: effectiveStartupId,
    payment_date: paymentTimestamp,
  });

  if (paymentError) {
    console.error("Error recording payment:", paymentError);
  } else {
    console.log("Payment recorded successfully");
  }

  // A freshly inserted row is already paid + live with the correct plan, so
  // just send the "you're live" notification and finish (skip update paths).
  if (insertedNewStartup && effectiveStartupId) {
    await publishPaidStartup(effectiveStartupId, insertedLaunchDate);
    return;
  }

  // Update startup based on product type
  if (product === "premium" && startup_id) {
    // Premium launch/upgrade - set is_live to true and plan to premium
    // Use payment date for launch_date so it launches immediately
    // Reset notification_sent so they get a new "you're live" email
    // Flip payment_status to 'paid' so live-publishing crons pick it up
    const { error } = await supabase
      .from("startups")
      .update({
        is_live: true,
        plan: "premium",
        payment_status: "paid",
        launch_date: paymentDate, // Use payment date for immediate launch
        notification_sent: false,
        notification_sent_at: null,
        updated_at: paymentTimestamp
      })
      .eq("id", startup_id);

    if (error) {
      console.error("Error updating startup for premium:", error);
    } else {
      console.log("Startup upgraded to premium and set live:", startup_id, "launch_date:", paymentDate);
    }

    // Call the publish-paid-startup function to send immediate notification
    try {
      const publishResponse = await fetch(
        `${supabaseUrl}/functions/v1/publish-paid-startup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ startupId: startup_id, paymentDate })
        }
      );

      if (publishResponse.ok) {
        const result = await publishResponse.json();
        console.log("Paid startup published immediately:", result);
      } else {
        console.error("Failed to publish paid startup immediately:", await publishResponse.text());
      }
    } catch (publishError) {
      console.error("Error calling publish-paid-startup function:", publishError);
    }
  } else if (product === "featured" && startup_id) {
    // Featured spot - set plan to featured with 1 week duration
    // Use payment date for launch_date so it launches immediately
    // Reset notification_sent so they get a new "you're live" email
    const featuredUntil = new Date();
    featuredUntil.setDate(featuredUntil.getDate() + 7); // 1 week subscription

    const { error } = await supabase
      .from("startups")
      .update({
        plan: "featured",
        is_live: true,
        payment_status: "paid",
        featured_until: featuredUntil.toISOString(),
        launch_date: paymentDate, // Use payment date for immediate launch
        notification_sent: false,
        notification_sent_at: null,
        updated_at: paymentTimestamp
      })
      .eq("id", startup_id);

    if (error) {
      console.error("Error updating startup for featured:", error);
    } else {
      console.log("Startup upgraded to featured and set live:", startup_id, "launch_date:", paymentDate, "featured_until:", featuredUntil.toISOString());
    }

    // Call the publish-paid-startup function to send immediate notification
    try {
      const publishResponse = await fetch(
        `${supabaseUrl}/functions/v1/publish-paid-startup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ startupId: startup_id, paymentDate })
        }
      );

      if (publishResponse.ok) {
        const result = await publishResponse.json();
        console.log("Featured startup published immediately:", result);
      } else {
        console.error("Failed to publish featured startup immediately:", await publishResponse.text());
      }
    } catch (publishError) {
      console.error("Error calling publish-paid-startup function:", publishError);
    }
  } else if ((product === "pro" || product === "lite") && startup_id) {
    // Pro/Lite launch - set is_live to true and update plan
    // Use payment date for launch_date so it launches immediately
    const { error } = await supabase
      .from("startups")
      .update({
        is_live: true,
        plan: product,
        payment_status: "paid",
        launch_date: paymentDate,
        notification_sent: false,
        notification_sent_at: null,
        updated_at: paymentTimestamp
      })
      .eq("id", startup_id);

    if (error) {
      console.error(`Error updating startup for ${product}:`, error);
    } else {
      console.log(`Startup upgraded to ${product} and set live:`, startup_id, "launch_date:", paymentDate);
    }

    // Call the publish-paid-startup function to send immediate notification
    try {
      const publishResponse = await fetch(
        `${supabaseUrl}/functions/v1/publish-paid-startup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ startupId: startup_id, paymentDate })
        }
      );

      if (publishResponse.ok) {
        const result = await publishResponse.json();
        console.log(`${product} startup published immediately:`, result);
      } else {
        console.error(`Failed to publish ${product} startup immediately:`, await publishResponse.text());
      }
    } catch (publishError) {
      console.error("Error calling publish-paid-startup function:", publishError);
    }
  } else if (product === "featured") {
    // Featured spot without startup_id - just log for manual handling
    console.log("Featured spot purchased without startup_id, customer:", session.customer_email);
  } else if (!startup_id) {
    console.log("Payment completed without startup_id, product:", product, "customer:", session.customer_email);
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

// ---------------------------------------------------------------------------
// Deferred-insert helpers
//
// New paid launches are NOT written to the DB until Stripe confirms payment.
// The client passes the full submission in checkout metadata; these helpers
// materialize it into a paid + live `startups` row inside the webhook.
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return (
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "startup"
  );
}

// launch_date must be a weekday (Mon–Fri) per the startups CHECK constraint.
// Bump Sat/Sun forward to Monday. Pure UTC arithmetic — we only classify the
// day of week, so there is no timezone drift.
function toWeekday(dateStr: string, fallbackPstDate: string): string {
  const parse = (s: string) => (s || "").split("-").map((n) => parseInt(n, 10));
  let [y, mo, da] = parse(dateStr);
  if (!y || !mo || !da) [y, mo, da] = parse(fallbackPstDate);
  const d = new Date(Date.UTC(y, mo - 1, da, 12));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function insertPaidStartupFromMetadata(
  session: Stripe.Checkout.Session,
  product: string,
  paymentDate: string,
  paymentTimestamp: string,
): Promise<{ id: string; launchDate: string }> {
  const m = session.metadata || {};
  const launchDate = toWeekday(m.sub_launch_date || "", paymentDate);

  let author: Record<string, unknown> = {};
  try {
    author = JSON.parse(m.sub_author || "{}");
  } catch {
    author = {};
  }
  // Guarantee an email so the "you're live" notification can be sent.
  if (!author.email && m.sub_contact_email) author.email = m.sub_contact_email;
  if (!author.email && session.customer_email) author.email = session.customer_email;

  const tags = (m.sub_tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5);
  const cover = m.sub_screenshot || null;
  const baseRow: Record<string, unknown> = {
    title: m.sub_title || m.startup_title || "Untitled",
    url: m.sub_url || "",
    tagline: m.sub_tagline || null,
    description: m.sub_description || "",
    category: m.sub_category || null,
    tags: tags.length ? tags : null,
    author,
    logo_url: m.sub_logo || null,
    screenshot_url: cover,
    images: cover ? [cover] : null,
    plan: product, // 'premium' | 'featured'
    payment_status: "paid",
    is_live: true,
    launch_date: launchDate,
    notification_sent: false,
    notification_sent_at: null,
    updated_at: paymentTimestamp,
  };
  if (product === "featured") {
    const fu = new Date();
    fu.setDate(fu.getDate() + 7);
    baseRow.featured_until = fu.toISOString();
  }

  const baseSlug = (m.sub_slug || slugify(String(baseRow.title))).slice(0, 50);
  let slug = baseSlug;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("startups")
      .insert({ ...baseRow, slug })
      .select("id")
      .single();

    if (!error && data) {
      return { id: data.id, launchDate };
    }

    const msg = error?.message || "";
    if (error?.code === "23505" && /slug/i.test(msg)) {
      slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
      continue;
    }
    if (error?.code === "23505" && /url/i.test(msg)) {
      // The URL is already listed. The paying user owns this launch, so upgrade
      // the existing row to paid + live rather than failing (which would mean
      // they paid and got nothing).
      const update: Record<string, unknown> = {
        plan: product,
        payment_status: "paid",
        is_live: true,
        launch_date: launchDate,
        notification_sent: false,
        notification_sent_at: null,
        updated_at: paymentTimestamp,
      };
      if (product === "featured") update.featured_until = baseRow.featured_until;
      const { data: up, error: upErr } = await supabase
        .from("startups")
        .update(update)
        .eq("url", baseRow.url)
        .select("id")
        .single();
      if (!upErr && up) return { id: up.id, launchDate };
      throw new Error(`URL conflict and update failed: ${upErr?.message || "unknown"}`);
    }

    throw new Error(`Insert paid startup failed: ${msg || "unknown error"}`);
  }
  throw new Error("Could not insert paid startup after slug retries");
}

async function publishPaidStartup(startupId: string, paymentDate: string): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/publish-paid-startup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ startupId, paymentDate }),
    });
    if (res.ok) {
      console.log("Paid startup published immediately:", await res.json());
    } else {
      console.error("Failed to publish paid startup immediately:", await res.text());
    }
  } catch (err) {
    console.error("Error calling publish-paid-startup function:", err);
  }
}
