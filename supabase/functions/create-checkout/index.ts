import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs from Stripe Dashboard. Env vars take precedence; fallbacks must
// always be the CURRENT active Price IDs. When pricing changes, archive old
// prices in Stripe AFTER updating both the env vars and these fallbacks.
const PRICE_IDS = {
  premium: Deno.env.get("STRIPE_PREMIUM_PRICE_ID") || "price_1TUWnH9t8rFDtfIcbVupUviU", // $20 one-time
  featured: Deno.env.get("STRIPE_FEATURED_PRICE_ID") || "price_1TUWne9t8rFDtfIcF1rGaIJZ", // $50/week
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { product, startupId, startupTitle, userEmail, successUrl, cancelUrl } = await req.json();

    if (!product || !PRICE_IDS[product as keyof typeof PRICE_IDS]) {
      return new Response(
        JSON.stringify({ error: "Invalid product" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceId = PRICE_IDS[product as keyof typeof PRICE_IDS];
    
    // Determine if this is a subscription (featured) or one-time (premium)
    const mode = product === "featured" ? "subscription" : "payment";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: mode,
      success_url: successUrl || "https://submithunt.com/payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: cancelUrl || "https://submithunt.com/submit",
      metadata: {
        product,
        startup_id: startupId || "",
        startup_title: startupTitle || "",
      },
    };

    // Pre-fill email if provided
    if (userEmail) {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
