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

  // verify_jwt is disabled for this function (pg_cron calls it via pg_net, which
  // can't mint platform JWTs). This shared-secret check is the auth gate; the
  // secret lives in Vault (DB side) and in the CRON_SECRET edge secret.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Finalize rankings for yesterday's launch — i.e. after all of its votes are in.
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    console.log("Finalizing rankings for:", yesterdayStr);

    // All live startups that launched yesterday.
    const { data: startups, error: fetchError } = await supabase
      .from("startups")
      .select("id, title, upvote_count, created_at, launch_date")
      .eq("is_live", true)
      .eq("launch_date", yesterdayStr);

    if (fetchError) {
      throw fetchError;
    }

    if (!startups || startups.length === 0) {
      return new Response(
        JSON.stringify({ message: "No startups to rank for yesterday", date: yesterdayStr }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${startups.length} startups for ${yesterdayStr}`);

    // Rank STRICTLY by upvotes (descending). Earliest submission breaks ties.
    // Startups with no upvotes are not ranked (daily_rank = null) — same rule as
    // the live update_daily_rankings() RPC, so the badge never flips from its
    // live value once the day closes.
    const ranked = startups
      .filter((s) => (s.upvote_count || 0) > 0)
      .sort((a, b) => {
        const va = a.upvote_count || 0;
        const vb = b.upvote_count || 0;
        if (vb !== va) return vb - va;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    const unranked = startups.filter((s) => (s.upvote_count || 0) <= 0);

    const updates = [];
    for (let i = 0; i < ranked.length; i++) {
      const startup = ranked[i];
      const rank = i + 1;
      console.log(`Rank ${rank}: ${startup.title} (${startup.upvote_count || 0} upvotes)`);
      const { error: updateError } = await supabase
        .from("startups")
        .update({ daily_rank: rank })
        .eq("id", startup.id);
      if (updateError) {
        console.error(`Error updating rank for ${startup.title}:`, updateError);
      } else {
        updates.push({ id: startup.id, title: startup.title, rank, upvotes: startup.upvote_count || 0 });
      }
    }

    // Clear rank for startups with no upvotes.
    for (const startup of unranked) {
      await supabase.from("startups").update({ daily_rank: null }).eq("id", startup.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: yesterdayStr,
        startupsRanked: updates.length,
        unranked: unranked.length,
        rankings: updates,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
