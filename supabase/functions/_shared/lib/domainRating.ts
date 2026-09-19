// Domain Rating plumbing shared by update-domain-rating (writer) and
// send-backlink-reminder (reader). The stored row in site_config is the
// site-wide source of truth — api/stats.js reads the same row over REST.

export interface StoredDr {
  value: number
  measured_at: string // YYYY-MM-DD
  source: string
}

const TARGET = 'submithunt.com'
const FETCH_TIMEOUT_MS = 8000

function plausible(dr: unknown): dr is number {
  return typeof dr === 'number' && dr >= 1 && dr <= 100
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal })
    if (!res.ok) return null
    return await res.json().catch(() => null)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Probe for the current DR. Paths, in order:
//  1. The site's own Vercel proxy (api/domain-rating.js on submithunt.com),
//     which holds the free Ahrefs APIv3 key that the public endpoint has
//     required since Ahrefs' 2026-09-17 release. No Ahrefs key lives in
//     Supabase. The proxy CDN-caches per URL for a day — fine for a weekly job.
//  2. Ahrefs' v3 site-explorer API, only if an AHREFS_API_KEY edge secret is
//     ever set (needs a paid API plan; not the case as of 2026-09-18).
// Returns null when neither path yields a plausible number.
export async function probeAhrefsDr(): Promise<{ dr: number; source: string } | null> {
  const proxy = new URL('https://www.submithunt.com/api/domain-rating')
  proxy.searchParams.set('url', TARGET)
  const viaProxy = (await fetchJson(proxy.toString(), {})) as { domain_rating?: unknown } | null
  const proxied = viaProxy?.domain_rating
  if (plausible(proxied)) return { dr: Math.round(proxied), source: 'ahrefs-free' }

  const apiKey = Deno.env.get('AHREFS_API_KEY')
  if (apiKey) {
    const today = new Date().toISOString().slice(0, 10)
    const u = new URL('https://api.ahrefs.com/v3/site-explorer/domain-rating')
    u.searchParams.set('target', TARGET)
    u.searchParams.set('date', today)
    const data = (await fetchJson(u.toString(), { Authorization: `Bearer ${apiKey}` })) as
      | { domain_rating?: { domain_rating?: unknown } }
      | null
    const dr = data?.domain_rating?.domain_rating
    if (plausible(dr)) return { dr: Math.round(dr), source: 'ahrefs-api' }
  }

  return null
}

// deno-lint-ignore no-explicit-any
export async function readStoredDr(supabase: any): Promise<StoredDr | null> {
  const { data, error } = await supabase
    .from('site_config')
    .select('value')
    .eq('key', 'domain_rating')
    .maybeSingle()
  if (error || !data?.value) return null
  const v = data.value as Partial<StoredDr>
  if (!plausible(v.value)) return null
  return {
    value: Math.round(v.value),
    measured_at: typeof v.measured_at === 'string' ? v.measured_at : '',
    source: typeof v.source === 'string' ? v.source : 'unknown',
  }
}
