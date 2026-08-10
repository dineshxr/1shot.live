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

// Probe Ahrefs for the current DR. Two paths, authoritative first:
//  1. v3 API with the AHREFS_API_KEY edge secret — works as soon as the
//     account has API units and the secret is set (none as of 2026-08-10).
//  2. The public no-auth endpoint — returned 403 for everyone since
//     ~2026-08 but costs nothing to keep trying in a weekly job.
// Returns null when neither path yields a plausible number.
export async function probeAhrefsDr(): Promise<{ dr: number; source: string } | null> {
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

  const u = new URL('https://api.ahrefs.com/v3/public/domain-rating-free')
  u.searchParams.set('target', TARGET)
  const data = (await fetchJson(u.toString(), {})) as
    | { domain_rating?: { domain_rating?: unknown } }
    | null
  const dr = data?.domain_rating?.domain_rating
  if (plausible(dr)) return { dr: Math.round(dr), source: 'ahrefs-free' }

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
