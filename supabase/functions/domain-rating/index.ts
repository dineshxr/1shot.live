import { corsHeaders } from '../_shared/utils/cors.ts'

// Thin proxy for Ahrefs' free, public Domain Rating endpoint (no API key).
// Proxied (rather than called from the browser) to avoid CORS surprises and to
// keep one consistent shape: { domain_rating: number, target: string }.

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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      const u = new URL(AHREFS_URL)
      u.searchParams.set('target', host)
      res = await fetch(u.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
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
