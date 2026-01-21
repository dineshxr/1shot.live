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

    // Build RSS XML
    const rssItems = (startups || []).map((startup) => {
      const authorName = startup.author?.name || "";
      const xHandle = authorName.startsWith("@") ? authorName : (authorName ? `@${authorName}` : "");
      const pubDate = new Date(startup.launch_date || startup.created_at).toUTCString();
      
      return `
    <item>
      <title><![CDATA[${startup.title}]]></title>
      <link>https://www.submithunt.com/startup/${startup.slug}</link>
      <guid isPermaLink="true">https://www.submithunt.com/startup/${startup.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${startup.description || ""}]]></description>
      <author>${xHandle}</author>
      <category>${startup.category || "Startup"}</category>
      <website>${startup.url}</website>
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
