// Signed unsubscribe links for marketing emails.
//
// The unsubscribe endpoint is public (no JWT), so the token is what stops
// third parties from unsubscribing arbitrary addresses: an HMAC-SHA256 of the
// lowercased email, keyed with CRON_SECRET. The secret already exists on every
// email-sending function (it authenticates pg_cron calls) and an HMAC never
// reveals its key, so reusing it avoids provisioning a second edge secret.

const encoder = new TextEncoder()

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

export async function unsubscribeToken(email: string, secret: string): Promise<string> {
  return await hmacHex(normalizeEmail(email), secret)
}

export async function verifyUnsubscribeToken(
  email: string,
  token: string,
  secret: string,
): Promise<boolean> {
  const expected = await unsubscribeToken(email, secret)
  const given = (token || '').toLowerCase()
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  }
  return diff === 0
}

export function unsubscribeUrl(email: string, token: string, campaign: string): string {
  const base = Deno.env.get('SUPABASE_URL') ?? 'https://lbayphzxmdtdmrqmeomt.supabase.co'
  const u = new URL(`${base}/functions/v1/unsubscribe`)
  u.searchParams.set('e', normalizeEmail(email))
  u.searchParams.set('t', token)
  u.searchParams.set('c', campaign)
  return u.toString()
}
