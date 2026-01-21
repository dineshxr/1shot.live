import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ZAPIER_WEBHOOK_URL = Deno.env.get("ZAPIER_WEBHOOK_URL");
    
    if (!ZAPIER_WEBHOOK_URL) {
      console.error("ZAPIER_WEBHOOK_URL not configured");
      return new Response(
        JSON.stringify({ error: "Webhook URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the startup data from the request (called by database trigger)
    const payload = await req.json();
    const { record, old_record, type } = payload;

    // Only process when is_live changes from false to true
    if (type === "UPDATE" && record.is_live === true && old_record?.is_live === false) {
      const startup = record;
      
      // Extract X handle from author JSONB
      const authorName = startup.author?.name || "";
      const xHandle = authorName.startsWith("@") ? authorName : (authorName ? `@${authorName}` : "");
      
      // Build the tweet data for Zapier
      const tweetData = {
        startup_title: startup.title,
        startup_url: `https://www.submithunt.com/startup/${startup.slug}`,
        startup_website: startup.url,
        x_handle: xHandle,
        description: startup.description?.substring(0, 200) || "",
        category: startup.category || "",
        plan: startup.plan || "free",
        launch_date: startup.launch_date,
      };

      console.log("Sending to Zapier:", tweetData);

      // Send to Zapier webhook
      const zapierResponse = await fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tweetData),
      });

      if (!zapierResponse.ok) {
        console.error("Zapier webhook failed:", await zapierResponse.text());
        return new Response(
          JSON.stringify({ error: "Failed to notify Zapier" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Successfully notified Zapier for:", startup.title);
      return new Response(
        JSON.stringify({ success: true, startup: startup.title }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Not a relevant update, skip
    return new Response(
      JSON.stringify({ skipped: true, reason: "Not a live status change" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
