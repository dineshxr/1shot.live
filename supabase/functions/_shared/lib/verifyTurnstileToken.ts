const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY')

export async function verifyTurnstileToken(turnstileToken: string) {
  // Fail OPEN when no secret is configured. Otherwise a missing/misconfigured
  // secret would block every submission with "verification failed". Real
  // protection kicks in automatically once TURNSTILE_SECRET_KEY is set.
  if (!TURNSTILE_SECRET_KEY) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY is not set — skipping verification (failing open)')
    return { success: true, skipped: true }
  }

  const turnstileVerification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      secret: TURNSTILE_SECRET_KEY,
      response: turnstileToken,
    }),
  })

  const turnstileResult = await turnstileVerification.json()

  // Surface Cloudflare's error-codes so a misconfig (invalid-input-secret,
  // timeout-or-duplicate, etc.) is diagnosable from the function logs.
  if (!turnstileResult.success) {
    console.warn('[turnstile] verification failed:', turnstileResult['error-codes'])
  }

  return { success: turnstileResult.success, errorCodes: turnstileResult['error-codes'] }
}
