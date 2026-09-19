// Domain Rating proxy for the submit page's "DR now / With us" cards.
//
//   GET /api/domain-rating?url=<site>  →  { domain_rating: 44, target: "example.com" }
//                                       |  { error: "…", target }
//
// Calls Ahrefs' public DR endpoint with the APIv3 key in AHREFS_API_KEY (Vercel
// env). Ahrefs has required a key since its 2026-09-17 release; the key is free
// to generate and this endpoint consumes no API units. Successful lookups are
// CDN-cached per URL for a day (DR moves slowly), so repeat lookups never reach
// Ahrefs. Errors always come back as HTTP 200 with an `error` field so the
// client can hide the panel quietly; details go to the function logs.
//
// Data license: https://ahrefs.com/legal/domain-rating-license — the UI shows
// the required "Domain Rating by Ahrefs" attribution under the cards.

const AHREFS_URL = 'https://api.ahrefs.com/v3/public/domain-rating-free';
const FETCH_TIMEOUT_MS = 8000;

// "https://www.Example.com/path?x" → "example.com"
function normalizeHost(rawUrl) {
  let h = String(rawUrl || '').trim().toLowerCase();
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  h = h.replace(/^\/\//, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  h = h.replace(/^.*@/, '').replace(/^www\./, '').split(':')[0];
  return h;
}

function fail(res, message, target, status = 200) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message, target });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 'Method not allowed', '', 405);
  }
  const raw = req.method === 'GET'
    ? (req.query?.url ?? req.query?.target ?? '')
    : (req.body?.url ?? req.body?.target ?? '');
  const host = normalizeHost(raw);
  if (!host || !host.includes('.')) return fail(res, 'Enter a valid website URL.', host, 400);

  const apiKey = (process.env.AHREFS_API_KEY || '').trim();
  if (!apiKey) {
    console.error('domain-rating: AHREFS_API_KEY is not set');
    return fail(res, 'Domain Rating lookup is not configured.', host);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream;
  try {
    const u = new URL(AHREFS_URL);
    u.searchParams.set('target', host);
    upstream = await fetch(u, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    console.error(`domain-rating: fetch failed for ${host}:`, timedOut ? 'timeout' : err);
    return fail(res, timedOut ? 'Domain Rating lookup timed out.' : 'Domain Rating lookup failed.', host);
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    // 401/403 = bad or revoked key, 429 = rate limited.
    const detail = await upstream.text().catch(() => '');
    console.error(`domain-rating: Ahrefs responded ${upstream.status} for ${host}: ${detail.slice(0, 200)}`);
    return fail(res, `Domain Rating lookup failed (${upstream.status}).`, host);
  }

  const data = await upstream.json().catch(() => ({}));
  const dr = data?.domain_rating?.domain_rating;
  if (typeof dr !== 'number') return fail(res, 'No Domain Rating available for this site yet.', host);

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({ domain_rating: Math.round(dr * 10) / 10, target: host });
}
