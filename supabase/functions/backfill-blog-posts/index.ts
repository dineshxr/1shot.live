import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Daily sweep (pg_cron) that fires blog generation for any recently-live
// startup that somehow doesn't have a blog post yet.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

    let limit = 30
    let daysBack = 7 // only look at startups from the last 7 days by default
    try {
      const body = await req.json()
      if (body?.limit) limit = Math.min(Number(body.limit), 100)
      if (body?.days_back) daysBack = Number(body.days_back)
    } catch (_) { /* no body */ }

    const since = new Date()
    since.setDate(since.getDate() - daysBack)
    const sinceIso = since.toISOString()

    console.log(`Looking for live startups since ${sinceIso} (last ${daysBack} days) without blog posts...`)

    // Step 1: IDs that already have blog posts
    const { data: existingBlogs, error: blogErr } = await supabase
      .from('blog_posts')
      .select('startup_id')
      .not('startup_id', 'is', null)

    if (blogErr) throw blogErr

    const coveredIds = new Set((existingBlogs || []).map((b: any) => b.startup_id))

    // Step 2: Recent live startups only
    const { data: recent, error: liveErr } = await supabase
      .from('startups')
      .select('id, title, slug, created_at, launch_date')
      .eq('is_live', true)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500)

    if (liveErr) throw liveErr

    const missing = (recent || []).filter((s: any) => !coveredIds.has(s.id)).slice(0, limit)

    if (missing.length === 0) {
      console.log('All recent startups already have blog posts.')
      return new Response(
        JSON.stringify({ success: true, message: `All live startups from the last ${daysBack} days have blog posts.`, triggered: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Firing blog generation for ${missing.length} recent startups...`)

    for (const startup of missing) {
      fetch(`${supabaseUrl}/functions/v1/generate-blog-post`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startup_id: startup.id }),
      }).then(r => r.json())
        .then(d => console.log(`Done: ${startup.title} -> slug=${d.blog_post?.slug || d.blog_slug} dup=${d.duplicate}`))
        .catch(e => console.error(`Failed: ${startup.title}:`, e))
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Triggered blog generation for ${missing.length} recent startups (last ${daysBack} days).`,
        triggered: missing.length,
        startups: missing.map((s: any) => ({ id: s.id, title: s.title, created_at: s.created_at })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('backfill-blog-posts error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
