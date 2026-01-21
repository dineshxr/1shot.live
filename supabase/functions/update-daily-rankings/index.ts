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

    // Get yesterday's date in YYYY-MM-DD format (EST timezone)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    console.log("Calculating rankings for:", yesterdayStr);

    // Get all startups launched yesterday that are live
    const { data: startups, error: fetchError } = await supabase
      .from("startups")
      .select("id, title, plan, upvote_count, created_at, launch_date")
      .eq("is_live", true)
      .eq("launch_date", yesterdayStr)
      .order("created_at", { ascending: true });

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

    // Calculate effective votes for each startup
    const startupsWithEffectiveVotes = startups.map((startup, index) => {
      let effectiveVotes = startup.upvote_count || 0;

      // Bonus for premium/featured: +1 vote
      if (startup.plan === "premium" || startup.plan === "featured") {
        effectiveVotes += 1;
        console.log(`${startup.title}: +1 bonus for ${startup.plan} plan`);
      }

      // Bonus for submission order (first 2 submissions of the day)
      // Index 0 = first submitted = +2 votes
      // Index 1 = second submitted = +1 vote
      if (index === 0) {
        effectiveVotes += 2;
        console.log(`${startup.title}: +2 bonus for first submission`);
      } else if (index === 1) {
        effectiveVotes += 1;
        console.log(`${startup.title}: +1 bonus for second submission`);
      }

      return {
        ...startup,
        effectiveVotes,
        submissionOrder: index + 1
      };
    });

    // Sort by effective votes (descending), then by created_at (ascending) for ties
    startupsWithEffectiveVotes.sort((a, b) => {
      if (b.effectiveVotes !== a.effectiveVotes) {
        return b.effectiveVotes - a.effectiveVotes;
      }
      // For ties, earlier submission wins
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    // Assign ranks and update database
    const updates = [];
    for (let i = 0; i < startupsWithEffectiveVotes.length; i++) {
      const startup = startupsWithEffectiveVotes[i];
      const rank = i + 1;

      console.log(`Rank ${rank}: ${startup.title} (${startup.effectiveVotes} effective votes)`);

      const { error: updateError } = await supabase
        .from("startups")
        .update({ daily_rank: rank })
        .eq("id", startup.id);

      if (updateError) {
        console.error(`Error updating rank for ${startup.title}:`, updateError);
      } else {
        updates.push({
          id: startup.id,
          title: startup.title,
          rank,
          effectiveVotes: startup.effectiveVotes,
          actualVotes: startup.upvote_count || 0,
          plan: startup.plan,
          submissionOrder: startup.submissionOrder
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: yesterdayStr,
        startupsRanked: updates.length,
        rankings: updates
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
