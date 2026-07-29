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
// Both products are now one-time payments (mode: "payment" below).
const PRICE_IDS = {
  premium: Deno.env.get("STRIPE_PREMIUM_PRICE_ID") || "price_1TUWnH9t8rFDtfIcbVupUviU", // $20 one-time
  featured: Deno.env.get("STRIPE_FEATURED_PRICE_ID") || "price_1TUWne9t8rFDtfIcF1rGaIJZ", // $50 one-time
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Turnstile is NOT used on the paid flow — payment itself gates spam, and
    // requiring a challenge here only adds a failure point. (Free submissions
    // still verify Turnstile via the verify-turnstile function.)
    const { product, startupId, startupTitle, userEmail, successUrl, cancelUrl, submission } = await req.json();

    if (!product || !PRICE_IDS[product as keyof typeof PRICE_IDS]) {
      return new Response(
        JSON.stringify({ error: "Invalid product" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceId = PRICE_IDS[product as keyof typeof PRICE_IDS];

    // All products are one-time payments. The webhook acts on
    // checkout.session.completed:
    //   • startupId present  → UPGRADE an existing row (dashboard upgrades)
    //   • submission present → INSERT a new paid+live row (new /submit launch)
    // Either way nothing is written to the DB until payment actually succeeds.
    const mode = "payment" as const;

    // Stripe metadata limits: ≤50 keys, each value ≤500 chars. Cap every value
    // so a long description / screenshot URL can never break session creation.
    const cap = (v: unknown, n = 500): string =>
      (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)).slice(0, n);

    // Serialize an object into a metadata value, dropping the listed keys from
    // last to first until it fits. Truncating JSON instead would hand the
    // webhook an unparseable string and silently lose the whole payload.
    const fitJson = (obj: Record<string, unknown>, droppable: string[], limit = 500): string => {
      const working = { ...obj };
      for (const [k, v] of Object.entries(working)) {
        if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) delete working[k];
      }
      let out = JSON.stringify(working);
      for (const key of droppable) {
        if (out.length <= limit) break;
        delete working[key];
        out = JSON.stringify(working);
      }
      return out.length <= limit ? out : "{}";
    };

    const metadata: Record<string, string> = {
      product,
      startup_id: startupId || "",
      startup_title: startupTitle || (submission?.title ? cap(submission.title, 200) : ""),
    };

    // Only carry a deferred-insert payload for NEW launches (no startupId).
    if (submission && !startupId) {
      metadata.sub = "1";
      metadata.sub_title = cap(submission.title, 200);
      metadata.sub_url = cap(submission.url, 400);
      metadata.sub_tagline = cap(submission.tagline, 200);
      metadata.sub_description = cap(submission.description, 500);
      metadata.sub_slug = cap(submission.slug, 80);
      metadata.sub_category = cap(submission.category, 80);
      metadata.sub_tags = cap(submission.tags, 200);
      metadata.sub_author = cap(submission.author, 500);
      metadata.sub_logo = cap(submission.logo_url, 500);
      metadata.sub_screenshot = cap(submission.screenshot_url, 500);
      metadata.sub_launch_date = cap(submission.launch_date, 20);
      metadata.sub_contact_email = cap(submission.contact_email, 200);

      // Descriptions run to 600 chars in the form; a metadata value stops at
      // 500, so the tail rides in a second key and the webhook re-joins them.
      const description = typeof submission.description === "string" ? submission.description : "";
      if (description.length > 500) metadata.sub_description2 = description.slice(500, 1000);

      metadata.sub_video = cap(submission.demo_video_url, 400);

      // Gallery: one key per screenshot — five joined URLs would blow the cap.
      const images: string[] = Array.isArray(submission.images) ? submission.images : [];
      images.slice(0, 5).forEach((url, i) => {
        if (url) metadata[`sub_img${i}`] = cap(url, 500);
      });

      // details jsonb, split across two keys: the maker's own answers (short,
      // must survive) and the AI-extracted extras (long, dropped field by
      // field if they don't fit).
      const details = (submission.details || {}) as Record<string, unknown>;
      metadata.sub_extras = fitJson(
        {
          categories: details.categories,
          seo_keyword: details.seo_keyword,
          pricing_model: details.pricing_model,
          open_source: details.open_source === true ? true : undefined,
          discount: details.discount,
        },
        ["discount", "seo_keyword", "categories"],
      );
      // 500 == LIMITS.firstComment in the submit form == Stripe's per-value cap.
      // Anything lower silently truncates a paid maker's first comment mid-word
      // while the free path stores it in full.
      metadata.sub_comment = cap(details.first_comment, 500);
      metadata.sub_ai = fitJson(
        {
          pricing: details.pricing,
          targetAudience: details.targetAudience,
          socialLinks: details.socialLinks,
          techStack: details.techStack,
        },
        ["techStack", "socialLinks", "targetAudience", "pricing"],
      );
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: mode,
      // Let customers enter a promo code at checkout (e.g. HACK = 50% off).
      allow_promotion_codes: true,
      success_url: successUrl || "https://submithunt.com/payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: cancelUrl || "https://submithunt.com/submit",
      metadata,
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
