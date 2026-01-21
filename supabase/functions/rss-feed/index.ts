import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get recently launched startups (is_live = true, last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: startups, error } = await supabase
      .from("startups")
      .select("*")
      .eq("is_live", true)
      .gte("launch_date", sevenDaysAgo.toISOString().split("T")[0])
      .order("launch_date", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    // Helper function to escape XML special characters
    const escapeXml = (str: string) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); // Remove control characters
    };

    // Build RSS XML with tweet-ready content for Buffer
    const rssItems = (startups || []).map((startup) => {
      const authorName = startup.author?.name || "";
      const xHandle = authorName.startsWith("@") ? authorName : (authorName ? `@${authorName}` : "");
      const pubDate = new Date(startup.launch_date || startup.created_at).toUTCString();
      const startupUrl = `https://submithunt.com/startup/${startup.slug}`;
      
      // Clean description for tweet
      const cleanDesc = (startup.description || "").replace(/[\n\r]+/g, " ").trim();
      const shortDesc = cleanDesc.substring(0, 100) + (cleanDesc.length > 100 ? "..." : "");
      
      // Create tweet-ready text for Buffer (plain text, no special chars)
      const tweetText = xHandle 
        ? `New launch: ${startup.title} - ${shortDesc} by ${xHandle} ${startupUrl}`
        : `New launch: ${startup.title} - ${shortDesc} ${startupUrl}`;
      
      return `
    <item>
      <title>${escapeXml(startup.title)}</title>
      <link>${escapeXml(startupUrl)}</link>
      <guid isPermaLink="true">${escapeXml(startupUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(cleanDesc)}</description>
      <author>${escapeXml(xHandle)}</author>
      <category>${escapeXml(startup.category || "Startup")}</category>
      <website>${escapeXml(startup.url)}</website>
      <tweetText>${escapeXml(tweetText)}</tweetText>
    </item>`;
    }).join("");

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>SubmitHunt - New Launches</title>
    <link>https://www.submithunt.com</link>
    <description>Latest startup launches on SubmitHunt</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/rss-feed" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
