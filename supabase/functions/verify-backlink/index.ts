import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils/cors.ts'

// Verifies that a do-follow link/badge pointing at submithunt.com is present on
// the user's own product page, then records it (service role) so the free-plan
// insert trigger (enforce_free_unlock) will let the launch through.
//
// Flow: the browser sends { linkUrl, productUrl } with the signed-in user's
// access token. We resolve the user from that token, fetch linkUrl, scan for a
// do-follow <a> to submithunt.com, and on success upsert a backlink_verifications
// row keyed by (user email, normalized product host).

const REQUIRED_HOST = 'submithunt.com'
const FETCH_TIMEOUT_MS = 8000
const MAX_BYTES = 5_000_000 // cap page size we parse (5 MB; footer badges sit late on heavy pages)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mirror of public.sh_normalize_host(): lowercase, strip scheme, leading www.,
// path, query, fragment, port. MUST stay in sync with the SQL function so the
// host recorded here matches what the trigger derives from startups.url.
function normalizeHost(rawUrl: string): string {
  if (!rawUrl) return ''
  let h = rawUrl.trim().toLowerCase()
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // scheme
  h = h.replace(/^\/\//, '')                   // protocol-relative href (//host)
  h = h.split('/')[0]                          // path (before userinfo)
  h = h.split('?')[0]                          // query
  h = h.split('#')[0]                          // fragment
  h = h.replace(/^.*@/, '')                    // userinfo (greedy → last @)
  h = h.replace(/^www\./, '')                  // www (after userinfo)
  h = h.split(':')[0]                          // port
  return h
}

// True when host b is the same as, or a subdomain of, host a (either direction),
// so a link placed on either the apex or a subdomain of the product counts.
// Requires the SHORTER (base) host to have at least two labels, so a bare
// suffix can't over-match (e.g. sameSite('xyz.co','co') must be false). This is
// a cheap guard rather than a full public-suffix list, which is overkill for a
// badge check whose real binding is product_host == startups.url host.
function sameSite(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const base = a.length <= b.length ? a : b
  const other = base === a ? b : a
  if (base.split('.').length < 2) return false // reject bare-TLD/suffix base
  return other.endsWith('.' + base)
}

// SSRF guard: we fetch a user-supplied URL, so refuse anything that isn't a
// public DNS hostname. Real product sites use registrable domains, never IP
// literals or internal names — so this blocks metadata/localhost/private-range
// probing without affecting legitimate use. (Residual: DNS rebinding to a
// private IP; acceptable for a blind boolean badge-checker.)
function isPublicHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') ||
      h.endsWith('.internal') || h.endsWith('.lan') || h === 'metadata' || h === 'metadata.google.internal') {
    return false
  }
  // IPv4 literal → block (all of them: private ranges and metadata IPs included).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false
  // IPv6 literal (contains a colon) → block.
  if (h.includes(':')) return false
  // Require a dotted, registrable-looking domain.
  if (!h.includes('.')) return false
  return true
}

// Find every <a ...> tag and return those whose href host is submithunt.com,
// along with their rel attribute. A regex scan (no DOM in Deno) is sufficient
// and resilient to attribute ordering.
function findSubmitHuntAnchors(html: string): Array<{ rel: string; href: string }> {
  const out: Array<{ rel: string; href: string }> = []
  const anchorRe = /<a\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const tag = m[0]
    const hrefMatch = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    if (!hrefMatch) continue
    const href = (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '').trim()
    if (!href) continue
    const host = normalizeHost(href)
    if (host !== REQUIRED_HOST && !host.endsWith('.' + REQUIRED_HOST)) continue
    const relMatch = tag.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const rel = (relMatch ? (relMatch[2] ?? relMatch[3] ?? relMatch[4] ?? '') : '').toLowerCase()
    out.push({ rel, href })
  }
  return out
}

function relIsDofollow(rel: string): boolean {
  const tokens = rel.split(/[\s,]+/).filter(Boolean)
  return !tokens.includes('nofollow') && !tokens.includes('sponsored') && !tokens.includes('ugc')
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Some sites block default fetch UAs; present a normal browser UA.
        'User-Agent': 'Mozilla/5.0 (compatible; SubmitHuntBacklinkBot/1.0; +https://submithunt.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) {
      throw new Error(`The page returned HTTP ${res.status}.`)
    }
    const reader = res.body?.getReader()
    if (!reader) return await res.text()
    const decoder = new TextDecoder()
    let html = ''
    let received = 0
    // Stream and stop early once we've seen enough bytes.
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      html += decoder.decode(value, { stream: true })
      if (received >= MAX_BYTES) {
        try { await reader.cancel() } catch (_e) { /* ignore */ }
        break
      }
    }
    return html
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ verified: false, error: 'Method not allowed' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Resolve the signed-in user from their access token (the gate is tied to
    // the authenticated email, never a client-supplied one).
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user?.email) {
      return json({ verified: false, error: 'Please sign in to verify your backlink.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const linkUrl = String(body?.linkUrl ?? '').trim()
    const productUrl = String(body?.productUrl ?? '').trim()

    if (!linkUrl) {
      return json({ verified: false, error: 'Enter the URL where you placed our link.' }, 400)
    }
    let linkParsed: URL
    try {
      linkParsed = new URL(linkUrl)
    } catch {
      return json({ verified: false, error: 'That doesn\'t look like a valid URL. Include https://' }, 400)
    }
    if (linkParsed.protocol !== 'http:' && linkParsed.protocol !== 'https:') {
      return json({ verified: false, error: 'The URL must start with http:// or https://' }, 400)
    }
    if (!isPublicHost(linkParsed.hostname)) {
      return json({ verified: false, error: 'Enter a public URL on your product\'s own domain.' }, 400)
    }

    const linkHost = normalizeHost(linkUrl)
    const productHost = normalizeHost(productUrl)
    if (!productHost) {
      return json({ verified: false, error: 'Enter your product URL first.' }, 400)
    }
    // The badge must live on the product's OWN site (homepage or footer), not on
    // some third-party page that happens to already link to us.
    if (!sameSite(linkHost, productHost)) {
      return json({
        verified: false,
        error: `The link must be on your product's own website (${productHost}). You entered a page on ${linkHost}.`,
      }, 400)
    }

    let html: string
    try {
      html = await fetchPage(linkUrl)
    } catch (e) {
      const msg = (e as Error)?.name === 'AbortError'
        ? 'That page took too long to respond. Check the URL and try again.'
        : ((e as Error)?.message || 'Could not fetch that page.')
      return json({ verified: false, error: msg }, 400)
    }

    const anchors = findSubmitHuntAnchors(html)
    if (anchors.length === 0) {
      return json({
        verified: false,
        error: 'We couldn\'t find a link to submithunt.com on that page. Make sure the badge is published and the URL is exact.',
      }, 400)
    }

    const dofollow = anchors.find((a) => relIsDofollow(a.rel))
    if (!dofollow) {
      return json({
        verified: false,
        error: 'The SubmitHunt link is marked nofollow/sponsored. Remove the rel="nofollow" (or sponsored/ugc) so it passes link equity.',
      }, 400)
    }

    // Verified — record it (service role) so the insert trigger will allow the
    // matching free-plan launch. productHost is guaranteed non-empty above, so a
    // verified:true response always implies a persisted row.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })
    const { error: insErr } = await admin.from('backlink_verifications').insert({
      user_email: user.email,
      product_host: productHost,
      link_url: linkUrl,
      dofollow: true,
    })
    if (insErr) {
      console.error('backlink_verifications insert failed:', insErr)
      return json({ verified: false, error: 'Verified the link but failed to save it. Please try again.' }, 500)
    }

    return json({ verified: true, host: productHost, linkUrl }, 200)
  } catch (e) {
    return json({ verified: false, error: String((e as Error)?.message || e) }, 500)
  }
})
