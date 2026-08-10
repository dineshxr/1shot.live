import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils/cors.ts'
import { normalizeEmail, verifyUnsubscribeToken } from '../_shared/lib/unsubscribeToken.ts'

// Public unsubscribe endpoint for marketing emails (deployed verify_jwt=false).
// Auth is the HMAC token in the link — see _shared/lib/unsubscribeToken.ts.
//
// GET  ?e=<email>&t=<token>  -> records the opt-out, renders a confirmation page
// POST ?e=<email>&t=<token>  -> RFC 8058 one-click unsubscribe (List-Unsubscribe-Post
//                               header); mail clients POST with no body we care about.

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${title} — SubmitHunt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 480px; margin: 60px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background-color: #60a5fa; padding: 24px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 22px;">${title}</h1>
    </div>
    <div style="padding: 28px; text-align: center;">
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">${body}</p>
      <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none; font-size: 14px;">← Back to SubmitHunt</a>
    </div>
  </div>
</body>
</html>`,
    { status, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return page('Not allowed', 'This link only supports GET and POST.', 405)
  }

  const url = new URL(req.url)
  const email = normalizeEmail(url.searchParams.get('e') ?? '')
  const token = url.searchParams.get('t') ?? ''
  const campaign = url.searchParams.get('c') ?? 'unknown'

  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) {
    console.error('CRON_SECRET not configured')
    return page('Something went wrong', 'Please try again later.', 500)
  }

  if (!email || !token || !(await verifyUnsubscribeToken(email, token, secret))) {
    return page(
      'Invalid link',
      'This unsubscribe link is invalid or incomplete. Reply to any of our emails and we will remove you manually.',
      400,
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase
    .from('email_unsubscribes')
    .upsert(
      { email, reason: req.method === 'POST' ? `one-click:${campaign}` : `link:${campaign}` },
      { onConflict: 'email', ignoreDuplicates: true },
    )

  if (error) {
    console.error('Failed to record unsubscribe:', error)
    return page('Something went wrong', 'We could not process your request. Please try again.', 500)
  }

  console.log(`Unsubscribed ${email} (${req.method}, campaign=${campaign})`)

  // One-click POSTs come from mail clients; nobody sees the body. 200 is all
  // that matters there, but returning the page costs nothing.
  return page(
    "You're unsubscribed",
    `<strong>${email}</strong> will no longer receive marketing emails from SubmitHunt. You will still get transactional emails about your own launches.`,
  )
})
