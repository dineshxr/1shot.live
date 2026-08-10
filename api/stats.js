// /stats — a citable statistics page for SubmitHunt (served via a rewrite in
// vercel.json, same pattern as /directory). Every number is queried LIVE from
// the production Supabase database at render time using count-only requests;
// if a query fails (or is blocked by RLS and would read as a false zero) the
// page falls back to the most recent hand-verified snapshot, measured
// 2026-07-29, and dates the affected line "as of July 29, 2026" instead of
// today. Nothing on this page is ever rendered as a blank or a zero produced
// by a failed fetch.
//
// ---------------------------------------------------------------------------
// MAINTAINERS — HONESTY POLICY (non-negotiable):
//   Do NOT hand-edit any number in this file to a value that was not actually
//   measured. The FALLBACK block below may only be updated by re-measuring
//   production (count queries against the live DB / the Ahrefs API), and the
//   date next to it must be updated to the measurement date at the same time.
//   No growth percentages, no traffic claims (we have no page-view data), no
//   invented ratings. Upvotes are community upvotes, not star ratings.
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
const SITE = 'https://submithunt.com';

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Verified fallback snapshot — measured directly against production on
// 2026-07-29 (counts) and the Ahrefs API on 2026-07-28 (DR). See the
// maintainer note above before changing ANY of these.
const FALLBACK_DATE = 'July 29, 2026';
const FALLBACK = {
  total: 1661, // products submitted (startups, archived not true)
  live: 1476, // is_live = true, archived not true
  makers: 1365, // distinct maker accounts across submitted products
  upvotes: 544, // rows in `votes` (community upvotes — NOT star ratings)
  comments: 166, // rows in `comments`
  articles: 345, // blog_posts with is_published = true
  paid: 43, // premium + featured launches
  free: 1618, // derived: 1,661 total − 43 paid (no independent measurement)
};
// DR comes from site_config['domain_rating'] — the same row the marketing
// emails read, refreshed weekly by the update-domain-rating cron (or by hand;
// Ahrefs currently offers no API access). Still a verified fact rather than a
// per-request Ahrefs query; this constant is the last-known-good fallback if
// the config read fails.
const DR_FALLBACK = { value: 37, source: 'Ahrefs', measured: 'July 28, 2026' };

async function resolveDr() {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/site_config?select=value&key=eq.domain_rating&limit=1`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!r.ok) return DR_FALLBACK;
    const rows = await r.json();
    const v = rows && rows[0] && rows[0].value;
    if (!v || typeof v.value !== 'number' || v.value < 1 || v.value > 100) return DR_FALLBACK;
    let measured = DR_FALLBACK.measured;
    if (typeof v.measured_at === 'string') {
      const d = new Date(`${v.measured_at}T00:00:00Z`);
      if (!isNaN(d)) {
        measured = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      }
    }
    return { value: Math.round(v.value), source: 'Ahrefs', measured };
  } catch {
    return DR_FALLBACK;
  }
}

// "archived not true" — identical filter to api/sitemap.js.
const NOT_ARCHIVED = 'or=(archived.is.null,archived.is.false)';

// Count-only request: GET with limit=1 + Prefer: count=exact, read the total
// from the Content-Range header (e.g. "0-0/1476"). Returns null on any error.
async function countExact(query) {
  try {
    const sep = query.includes('?') ? '&' : '?';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}${sep}select=id&limit=1`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Prefer: 'count=exact' },
    });
    if (!r.ok) return null;
    const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Paginated row fetch (same pattern as api/sitemap.js) — used only for the
// category/maker aggregation, which cannot be done with count queries.
async function fetchAll(query) {
  const out = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    let page;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}&limit=1000&offset=${offset}`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      });
      if (!r.ok) break;
      page = await r.json();
    } catch {
      break;
    }
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const fmtNum = (n) => Number(n).toLocaleString('en-US');
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#f8fafc;line-height:1.5}
a{color:inherit;text-decoration:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
header.site{background:#fff;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:30}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:17px}
.brand .mark{width:26px;height:26px;border-radius:7px;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
nav.top a{color:#475569;font-size:14px;margin-left:22px}
nav.top a:hover,nav.top a.active{color:#0f172a}
.cta{background:#f97316;color:#fff!important;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:600}
.hero{padding:46px 0 10px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px}
.hero p{color:#475569;max-width:780px;font-size:16px}
.headline{background:linear-gradient(180deg,#fff7ed,#fff);border:2px solid #fdba74;border-radius:16px;padding:20px 24px;margin:22px 0 6px;font-size:18px;font-weight:600;color:#7c2d12;box-shadow:0 10px 22px -16px rgba(15,23,42,.5)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin:22px 0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px}
.card .n{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.card .l{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;margin-top:2px}
.card p{color:#475569;font-size:13.5px;margin-top:10px}
.asof{display:inline-block;margin-top:10px;font-size:11px;color:#9a3412;background:#ffedd5;border:1px solid #fdba74;border-radius:9999px;padding:2px 9px;font-weight:600}
.asof.snap{color:#475569;background:#f1f5f9;border-color:#e2e8f0}
h2.sec{font-size:22px;font-weight:800;letter-spacing:-.01em;margin:34px 0 12px}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;padding:13px 16px;border-bottom:1px solid #eef2f6;white-space:nowrap}
tbody td{padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
.rank{color:#cbd5e1;font-variant-numeric:tabular-nums;width:34px}
.cnt{font-variant-numeric:tabular-nums;font-weight:700}
.bar{display:inline-block;height:6px;border-radius:3px;background:#f97316;vertical-align:middle;margin-left:10px;opacity:.85}
.note{font-size:12px;color:#94a3b8;margin:12px 2px 0}
.about{margin:36px 0;color:#475569;font-size:15px;max-width:860px}
.about h2{font-size:20px;color:#0f172a;margin:22px 0 8px;font-weight:700}
.about ul{margin:8px 0 0 20px}
.about li{margin:6px 0}
.cite{background:#fff;border:1px solid #e5e7eb;border-left:4px solid #f97316;border-radius:10px;padding:14px 18px;margin:14px 0;font-size:14.5px;color:#334155}
footer.site{background:#fff;border-top:1px solid #e5e7eb;margin-top:40px}
footer.site .wrap{padding:28px 20px;display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;font-size:13px;color:#64748b}
footer.site a{color:#475569}footer.site a:hover{color:#0f172a}
@media(max-width:760px){.hero h1{font-size:26px}.headline{font-size:16px;padding:16px 18px}nav.top a:not(.cta){display:none}nav.top a.cta{margin-left:0}}
`;

export default async function handler(req, res) {
  const now = new Date();
  const today = fmtDate(now);

  // --- Live counts (all in parallel; each independently falls back) ---------
  // NOTE: `votes` is RLS-protected, so the anon key usually sees 0 rows — the
  // zero-guard below turns that into the verified fallback rather than a false
  // "0 upvotes" claim. We keep querying in case the policy ever opens up.
  const [cTotal, cLive, cUpvotes, cComments, cArticles, cFree, cPremium, cFeatured, rows, DR] =
    await Promise.all([
      countExact(`startups?${NOT_ARCHIVED}`),
      countExact(`startups?is_live=eq.true&${NOT_ARCHIVED}`),
      countExact('votes'),
      countExact('comments'),
      countExact('blog_posts?is_published=eq.true'),
      countExact(`startups?plan=eq.free&${NOT_ARCHIVED}`),
      countExact(`startups?plan=eq.premium&${NOT_ARCHIVED}`),
      countExact(`startups?plan=eq.featured&${NOT_ARCHIVED}`),
      // Category + maker aggregation source: every non-archived startup.
      fetchAll(`startups?select=is_live,category,email:author->>email&${NOT_ARCHIVED}`),
      // Shadows nothing: DR exists only inside the handler; resolveDr always
      // returns a usable object (falls back internally).
      resolveDr(),
    ]);

  // Every fallback baseline is > 0, so a 0 from any of these count queries can
  // only mean a broken query or an RLS-hidden table — never a real value.
  // Treating it as a failure is what keeps a false "0" off the page.
  const stat = (liveVal, fallbackVal) =>
    liveVal != null && liveVal > 0
      ? { v: liveVal, asOf: today, live: true }
      : { v: fallbackVal, asOf: FALLBACK_DATE, live: false };

  const total = stat(cTotal, FALLBACK.total);
  const live = stat(cLive, FALLBACK.live);
  const upvotes = stat(cUpvotes, FALLBACK.upvotes);
  const comments = stat(cComments, FALLBACK.comments);
  const articles = stat(cArticles, FALLBACK.articles);

  // Distinct makers: aggregated in JS from the row fetch.
  const makerSet = new Set();
  const catCounts = {};
  let liveRowCount = 0;
  for (const r of rows) {
    if (r && r.email) makerSet.add(String(r.email).toLowerCase());
    if (r && r.is_live === true) {
      liveRowCount++;
      if (r.category) catCounts[r.category] = (catCounts[r.category] || 0) + 1;
    }
  }
  const makers = stat(rows.length > 0 ? makerSet.size : null, FALLBACK.makers);

  // Plan split: trust the three live plan counts only when they are internally
  // consistent (they partition the total). `featured` can legitimately be a
  // small number, so the partition check — not a zero-guard — validates it.
  const planLive =
    cFree != null && cPremium != null && cFeatured != null && cTotal != null &&
    cFree > 0 && cFree + cPremium + cFeatured === cTotal;
  const plans = planLive
    ? { free: cFree, premium: cPremium, featured: cFeatured, paid: cPremium + cFeatured, asOf: today, live: true }
    : { free: FALLBACK.free, premium: null, featured: null, paid: FALLBACK.paid, asOf: FALLBACK_DATE, live: false };

  // Top 8 categories by live-listing count (only when the row fetch worked —
  // there is no verified per-category fallback, so on failure the section is
  // omitted entirely rather than filled with unmeasured numbers).
  const topCats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  const maxCat = topCats.length ? topCats[0][1] : 0;

  // --- Quotable sentences ---------------------------------------------------
  // Each line is a short standalone sentence that survives being quoted alone.
  const headline =
    live.asOf === makers.asOf
      ? `As of ${live.asOf}, SubmitHunt lists ${fmtNum(live.v)} live products from ${fmtNum(makers.v)} makers.`
      : `As of ${live.asOf}, SubmitHunt lists ${fmtNum(live.v)} live products. As of ${makers.asOf}, ${fmtNum(makers.v)} distinct makers have submitted a product.`;

  const planSentence = plans.live
    ? `As of ${plans.asOf}, ${fmtNum(plans.free)} SubmitHunt launches used the free plan and ${fmtNum(plans.paid)} were paid launches (${fmtNum(plans.premium)} premium, ${fmtNum(plans.featured)} featured).`
    : `As of ${plans.asOf}, ${fmtNum(plans.free)} SubmitHunt launches used the free plan and ${fmtNum(plans.paid)} were paid launches.`;

  const cards = [
    { n: total.v, label: 'Products submitted', asOf: total.asOf, live: total.live,
      s: `As of ${total.asOf}, makers have submitted ${fmtNum(total.v)} products to SubmitHunt.` },
    { n: live.v, label: 'Live products', asOf: live.asOf, live: live.live,
      s: `As of ${live.asOf}, SubmitHunt lists ${fmtNum(live.v)} live products.` },
    { n: makers.v, label: 'Makers', asOf: makers.asOf, live: makers.live,
      s: `As of ${makers.asOf}, ${fmtNum(makers.v)} distinct makers have submitted a product to SubmitHunt.` },
    { n: upvotes.v, label: 'Upvotes cast', asOf: upvotes.asOf, live: upvotes.live,
      s: `As of ${upvotes.asOf}, SubmitHunt users have cast ${fmtNum(upvotes.v)} upvotes.` },
    { n: comments.v, label: 'Comments', asOf: comments.asOf, live: comments.live,
      s: `As of ${comments.asOf}, SubmitHunt launches have received ${fmtNum(comments.v)} comments.` },
    { n: articles.v, label: 'Published articles', asOf: articles.asOf, live: articles.live,
      s: `As of ${articles.asOf}, SubmitHunt has published ${fmtNum(articles.v)} blog articles.` },
    { n: plans.paid, label: 'Paid launches', asOf: plans.asOf, live: plans.live, s: planSentence },
    { n: DR.value, label: 'Domain Rating (Ahrefs)', asOf: DR.measured, live: false,
      s: `SubmitHunt has an Ahrefs Domain Rating (DR) of ${DR.value}, measured on ${DR.measured}.` },
  ];

  // --- Head / meta / JSON-LD ------------------------------------------------
  const canonical = `${SITE}/stats`;
  const title = 'SubmitHunt Statistics — Products, Makers & Launch Data';
  const desc = `Citable SubmitHunt statistics, queried live from the production database: ${fmtNum(total.v)} products submitted, ${fmtNum(live.v)} live products from ${fmtNum(makers.v)} makers, ${fmtNum(articles.v)} published articles. Free to cite with attribution.`;

  const variableMeasured = [
    { name: 'Products submitted', value: total.v },
    { name: 'Live products', value: live.v },
    { name: 'Distinct makers', value: makers.v },
    { name: 'Upvotes cast', value: upvotes.v },
    { name: 'Comments', value: comments.v },
    { name: 'Published blog articles', value: articles.v },
    { name: 'Free-plan launches', value: plans.free },
    { name: 'Paid launches', value: plans.paid },
    { name: 'Ahrefs Domain Rating', value: DR.value },
  ].map((v) => ({ '@type': 'PropertyValue', name: v.name, value: v.value }));

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SubmitHunt platform statistics',
      description:
        'Key statistics for the SubmitHunt launch platform: products submitted, live listings, distinct makers, upvotes, comments, published articles, and launches by plan. Queried from the production database at render time.',
      url: canonical,
      isAccessibleForFree: true,
      creator: { '@type': 'Organization', name: 'SubmitHunt', url: `${SITE}/` },
      dateModified: now.toISOString().slice(0, 10),
      variableMeasured,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Statistics', item: canonical },
      ],
    },
  ];

  // --- Render ---------------------------------------------------------------
  const cardHtml = cards
    .map(
      (c) =>
        `<div class="card"><div class="n">${fmtNum(c.n)}</div><div class="l">${esc(c.label)}</div>` +
        `<p>${esc(c.s)}</p>` +
        `<span class="asof${c.live ? '' : ' snap'}">${c.live ? 'Live · ' : 'Verified snapshot · '}${esc(c.asOf)}</span></div>`,
    )
    .join('');

  const catRows = topCats
    .map(
      ([name, count], i) =>
        `<tr><td class="rank">${i + 1}</td><td>${esc(name)}</td>` +
        `<td class="cnt">${fmtNum(count)}<span class="bar" style="width:${Math.max(6, Math.round((count / maxCat) * 120))}px"></span></td></tr>`,
    )
    .join('');
  const catSection = topCats.length
    ? `<h2 class="sec">Top categories by live listings</h2>` +
      `<div class="panel"><table><thead><tr><th scope="col">#</th><th scope="col">Category</th><th scope="col">Live listings</th></tr></thead>` +
      `<tbody>${catRows}</tbody></table></div>` +
      `<p class="note">Counted across the ${fmtNum(liveRowCount)} live listings in the production database on ${esc(today)}. Each product is counted once, under its primary category.</p>`
    : '';

  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>${esc(title)} | SubmitHunt</title>` +
    `<meta name="description" content="${esc(desc)}" />` +
    `<link rel="canonical" href="${esc(canonical)}" />` +
    `<meta name="robots" content="index, follow" />` +
    `<meta property="og:type" content="website" /><meta property="og:title" content="${esc(title)}" />` +
    `<meta property="og:description" content="${esc(desc)}" /><meta property="og:url" content="${esc(canonical)}" />` +
    `<meta property="og:image" content="${SITE}/og-image.png?v=2" /><meta property="og:site_name" content="SubmitHunt" />` +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${SITE}/og-image.png?v=2" />` +
    `<link rel="icon" type="image/x-icon" href="/src/favicon_io/favicon.ico" />` +
    jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('') +
    `<style>${STYLES}</style></head><body>` +
    `<!-- MAINTAINERS: nothing on this page may be hand-edited to a number that was not measured. Live figures come from the production database at render time; fallbacks are the verified 2026-07-29 snapshot in api/stats.js. To change a number, change the query or re-measure — never type one in. -->` +
    `<header class="site"><div class="wrap"><a class="brand" href="/"><span class="mark">S</span>SubmitHunt</a>` +
    `<nav class="top"><a href="/">Discover</a><a href="/directory">Directory</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a><a class="cta" href="/submit">Submit your startup</a></nav>` +
    `</div></header>` +
    `<main class="wrap">` +
    `<div class="hero"><h1>SubmitHunt Statistics</h1>` +
    `<p>Citable, up-to-date numbers about the SubmitHunt launch platform, queried straight from the production database when this page is rendered. Journalists, bloggers, and researchers are welcome to quote any line below with attribution to <strong>submithunt.com/stats</strong>.</p></div>` +
    `<div class="headline">${esc(headline)}</div>` +
    `<div class="grid">${cardHtml}</div>` +
    `<p class="note">“Live” figures were queried from the production database when this page was rendered. “Verified snapshot” figures were measured by hand on the date shown and are used when a live query is unavailable — this page never shows a zero produced by a failed query. Upvotes are community upvotes, not star ratings.</p>` +
    catSection +
    `<section class="about"><h2>About this data</h2>` +
    `<p>The numbers on this page come straight from SubmitHunt's production database at render time, using exact count queries — they are not estimates, projections, or marketing copy. Where a live query is unavailable, the page shows the most recent hand-verified snapshot (measured ${esc(FALLBACK_DATE)}) and labels it with that date. The Domain Rating figure comes from ${esc(DR.source)} and was measured on ${esc(DR.measured)}.</p>` +
    `<p>SubmitHunt publishes no traffic or page-view figures here because we do not collect page-view data.</p>` +
    `<h2>Citing these statistics</h2>` +
    `<p>You may cite any figure on this page with attribution. A suggested citation:</p>` +
    `<div class="cite">SubmitHunt Statistics, submithunt.com/stats (retrieved ${esc(today)}).</div>` +
    `<p>Each stat is dated with the day it was measured, so a quoted line stays accurate on its own. If you need a number that is not listed here, <a href="mailto:hello@submithunt.com" style="color:#f97316">ask us</a> rather than estimating.</p>` +
    `</section>` +
    `</main>` +
    `<footer class="site"><div class="wrap"><div>© ${now.getFullYear()} SubmitHunt — submit your startup &amp; get a dofollow backlink.</div>` +
    `<div><a href="/">Discover</a> · <a href="/directory">Directory</a> · <a href="/submit">Submit</a> · <a href="/pricing">Pricing</a> · <a href="/blog">Blog</a> · <a href="/stats">Stats</a></div></div></footer>` +
    `</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
