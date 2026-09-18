import { corsHeaders } from '../_shared/utils/cors.ts'

// Thin proxy for Ahrefs' public Domain Rating endpoint. Since Ahrefs' release
// of 2026-09-17 the endpoint answers 403 without an APIv3 key; the key is free
// to generate on any Ahrefs account (Account settings → API keys) and requests
// to this endpoint consume no API units. Store it as the AHREFS_API_KEY
// function secret. Proxied (rather than called from the browser) so the key
// never ships to clients and to keep one consistent shape:
// { domain_rating: number, target: string }.
// Data license: https://ahrefs.com/legal/domain-rating-license — the UI shows
// the required "Domain Rating by Ahrefs" attribution next to the number.

const AHREFS_URL = 'https://api.ahrefs.com/v3/public/domain-rating-free'
const FETCH_TIMEOUT_MS = 8000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeHost(rawUrl: string): string {
  let h = (rawUrl || '').trim().toLowerCase()
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  h = h.replace(/^\/\//, '')
  h = h.split('/')[0].split('?')[0].split('#')[0]
  h = h.replace(/^.*@/, '').replace(/^www\./, '').split(':')[0]
  return h
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await req.json().catch(() => ({}))
    const host = normalizeHost(String(body?.url ?? body?.target ?? ''))
    if (!host || !host.includes('.')) {
      return json({ error: 'Enter a valid website URL.' }, 400)
    }

    const apiKey = (Deno.env.get('AHREFS_API_KEY') ?? '').trim()
    if (!apiKey) {
      console.error('domain-rating: AHREFS_API_KEY secret is not set — Ahrefs rejects keyless requests since 2026-09-17')
      return json({ error: 'Domain Rating lookup is not configured.', target: host }, 200)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      const u = new URL(AHREFS_URL)
      u.searchParams.set('target', host)
      res = await fetch(u.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      // 401/403 = bad or revoked key, 429 = rate limited. Logged (not shown)
      // so the client keeps hiding the panel quietly while ops can see why.
      const detail = await res.text().catch(() => '')
      console.error(`domain-rating: Ahrefs responded ${res.status} for ${host}: ${detail.slice(0, 200)}`)
      return json({ error: `Domain Rating lookup failed (${res.status}).`, target: host }, 200)
    }
    const data = await res.json().catch(() => ({}))
    // Shape: { domain_rating: { domain_rating: number, license } }
    const dr = data?.domain_rating?.domain_rating
    if (typeof dr !== 'number') {
      return json({ error: 'No Domain Rating available for this site yet.', target: host }, 200)
    }
    return json({ domain_rating: Math.round(dr * 10) / 10, target: host }, 200)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 200)
  }
})
