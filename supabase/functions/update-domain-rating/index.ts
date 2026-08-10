import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils/cors.ts'
import { probeAhrefsDr, readStoredDr } from '../_shared/lib/domainRating.ts'

// Weekly DR refresher (pg_cron job 'update-domain-rating-weekly', x-cron-secret
// auth). Probes Ahrefs (see _shared/lib/domainRating.ts for the two paths and
// why both currently fail) and writes the result to site_config, which the
// backlink-reminder emails and /stats read. Stores whatever the measurement
// says — up or down — because every consumer publishes the number as fact;
// showing a stale higher DR would be the same dishonesty the /stats page was
// built to avoid.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized', success: false }, 401)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const stored = await readStoredDr(supabase)
    const probed = await probeAhrefsDr()

    if (!probed) {
      console.log(`DR probe failed (expected until Ahrefs access exists); keeping stored value ${stored?.value ?? 'none'}`)
      return json({ success: true, updated: false, reason: 'probe_failed', kept: stored })
    }

    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from('site_config')
      .upsert(
        {
          key: 'domain_rating',
          value: { value: probed.dr, measured_at: today, source: probed.source },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
    if (error) throw error

    console.log(`DR updated: ${stored?.value ?? 'none'} -> ${probed.dr} (${probed.source})`)
    return json({ success: true, updated: true, previous: stored?.value ?? null, dr: probed.dr, source: probed.source })
  } catch (error) {
    console.error('Function error:', error)
    return json({ error: (error as Error).message, success: false }, 500)
  }
})
