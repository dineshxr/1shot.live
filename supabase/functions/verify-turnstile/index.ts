import { corsHeaders } from '../_shared/utils/cors.ts'
import { verifyTurnstileToken } from '../_shared/lib/verifyTurnstileToken.ts'

// Lightweight, public endpoint that validates a Cloudflare Turnstile token
// server-side. The free-plan submit flow calls this before inserting so a bot
// that never solved the challenge can't create a listing. Paid plans verify the
// token inside create-checkout instead.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ success: false, error: 'Method not allowed' }, 405)
    }

    const body = await req.json().catch(() => ({}))
    const turnstileToken = body?.turnstileToken

    if (!turnstileToken) {
      return json({ success: false, error: 'Missing verification token' }, 400)
    }

    const result = await verifyTurnstileToken(turnstileToken)
    if (!result.success) {
      return json({ success: false, error: 'Verification failed' }, 403)
    }

    return json({ success: true }, 200)
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message || e) }, 500)
  }
})
