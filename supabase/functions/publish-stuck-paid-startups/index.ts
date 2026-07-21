import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Safety net for paid startups whose Stripe webhook -> publish-paid-startup
// chain failed partway: any row that is paid but not live gets published here.
// It deliberately does NOT send email — it leaves notification_sent=false so
// the hourly send-live-notifications sweep delivers the one canonical,
// plan-aware launch email. Runs on a pg_cron schedule.
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // verify_jwt is disabled for this function (pg_cron calls it via pg_net,
  // which can't mint platform JWTs). This shared-secret check is the auth
  // gate; the secret lives in Vault and in the CRON_SECRET edge secret.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log("Finding stuck paid startups...")

    // Today's PST date — the basis the launch pipeline uses for "today".
    const todayPst = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

    // Find paid startups that have actually paid but are not live yet, whose
    // launch day has ALREADY arrived (launch_date <= today).
    // CRITICAL: filter on payment_status='paid' so unpaid pending rows (inserted
    // at form-submit time, awaiting Stripe webhook) are never promoted to live.
    // The launch_date gate leaves future-scheduled paid launches alone — they're
    // not stuck, they're waiting for their day.
    const { data: stuckStartups, error: findError } = await supabase
      .from('startups')
      .select('id, title, slug, plan, author, launch_date, is_live, created_at, payment_status')
      .eq('is_live', false)
      .eq('archived', false)
      .eq('payment_status', 'paid')
      .in('plan', ['premium', 'featured'])
      .lte('launch_date', todayPst)
      .order('created_at', { ascending: true })

    if (findError) {
      console.error('Error finding stuck paid startups:', findError)
      throw findError
    }

    // A row scheduled for TODAY should still go live at the 8 AM PST sweep, not
    // whenever this 30-minute net happens to fire — otherwise a legitimately
    // scheduled launch would appear at, say, 00:15 instead of the 8 AM we
    // promised. Overdue rows (launch_date < today) are always caught up now.
    const nowPst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const currentHour = nowPst.getHours()
    const dueStartups = (stuckStartups || []).filter(
      s => s.launch_date < todayPst || currentHour >= 8
    )

    console.log(`Found ${stuckStartups?.length || 0} not-live paid startups (${dueStartups.length} due to publish now)`)

    if (dueStartups.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No stuck paid startups due to publish',
          count: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // Publish each due startup; the hourly sweep handles the launch email.
    const results = []
    for (const startup of dueStartups) {
      try {
        console.log(`Publishing stuck paid startup: ${startup.title} (${startup.plan})`)

        // Keep the maker's chosen launch_date (it's already a weekday and due).
        // Overwriting it with "today" used to risk a weekend value that violates
        // the weekday CHECK constraint, and would rewrite a scheduled date.
        const { error: updateError } = await supabase
          .from('startups')
          .update({
            is_live: true,
            notification_sent: false, // hourly sweep sends the launch email
            notification_sent_at: null
          })
          .eq('id', startup.id)

        if (updateError) {
          throw updateError
        }

        // Kick off blog generation now so the post is ready by the time the
        // sweep emails the founder. Non-blocking.
        triggerBlogGeneration(startup.id)

        results.push({
          id: startup.id,
          title: startup.title,
          plan: startup.plan,
          created_at: startup.created_at,
          success: true
        })

        console.log(`Published stuck startup: ${startup.title} — launch email will go out with the next hourly sweep`)

      } catch (error) {
        console.error(`Error processing stuck startup ${startup.id}:`, error)
        results.push({
          id: startup.id,
          title: startup.title,
          plan: startup.plan,
          created_at: startup.created_at,
          error: error.message,
          success: false
        })
      }
    }

    return new Response(
      JSON.stringify({
        message: `Published ${results.filter(r => r.success).length} stuck paid startups`,
        success: true,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

function triggerBlogGeneration(startupId: string): void {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  fetch(`${supabaseUrl}/functions/v1/generate-blog-post`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ startup_id: startupId })
  }).then(r => r.json())
    .then(r => console.log(`Blog triggered for ${startupId}: slug=${r.blog_slug}, duplicate=${r.duplicate}`))
    .catch(e => console.error(`Blog trigger error for ${startupId}:`, e))
}
