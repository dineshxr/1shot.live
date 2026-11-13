// /category/:slug — programmatic landing pages, one per product category in
// the hand-curated allowlist (src/lib/categories.js). Self-contained server-
// rendered HTML (same pattern as api/directory.js): live listings in the
// category pulled at request time, ranked by upvotes, paginated 100 per page
// (?page=2, …) so every listing in the category is reachable by a plain link,
// with CollectionPage / ItemList / BreadcrumbList JSON-LD.
//
// Ported from the never-merged claude/free-route-backlink-unlock branch
// (8f52bbc) — www canonicals, current DR copy, pagination, no /stats links.
// Unknown slug or out-of-range page -> 404 + noindex.
import { SITE, SUPABASE_URL, SUPABASE_ANON, esc, clip } from '../lib/ssr.js';
import { CATEGORIES } from '../src/lib/categories.js';

const PAGE_SIZE = 100;
const OG_IMG = `${SITE}/og-image.png?v=49`;

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
.hero{padding:46px 0 8px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px}
.hero p{color:#475569;max-width:760px;font-size:16px}
.hero .meta{color:#94a3b8;font-size:13px;margin-top:10px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 6px}
.chips a{background:#fff;border:1px solid #e2e8f0;border-radius:9999px;padding:6px 14px;font-size:13px;color:#475569;white-space:nowrap}
.chips a:hover{border-color:#f97316;color:#0f172a}
.chips a.on{background:#fff7ed;border-color:#fdba74;color:#9a3412;font-weight:600}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:16px}
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;padding:13px 16px;border-bottom:1px solid #eef2f6;white-space:nowrap}
tbody td{padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#fcfdff}
.rank{color:#cbd5e1;font-variant-numeric:tabular-nums;width:34px}
.nm{font-weight:600;color:#0f172a}
.nm:hover{color:#f97316}
.tg{color:#64748b;font-size:13px;margin-top:2px;max-width:560px}
.up{font-variant-numeric:tabular-nums;font-weight:700;color:#0f172a;white-space:nowrap}
.up span{color:#f97316}
.dt{color:#94a3b8;font-size:13px;white-space:nowrap}
.view{font-weight:600;color:#f97316;white-space:nowrap}
.view:hover{text-decoration:underline}
.band{background:linear-gradient(180deg,#fff7ed,#fff);border:2px solid #fdba74;border-radius:16px;padding:22px 24px;margin:28px 0;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
.band h2{font-size:19px;font-weight:800;color:#0f172a}
.band p{color:#7c2d12;font-size:14px;margin-top:4px}
.band .submit{background:#f97316;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;white-space:nowrap}
.band .submit:hover{background:#ea580c}
.seo{margin:36px 0;color:#475569;font-size:15px;max-width:820px}
.seo h2{font-size:20px;color:#0f172a;margin:22px 0 8px;font-weight:700}
.seo a{color:#c2410c;text-decoration:underline}
footer.site{background:#fff;border-top:1px solid #e5e7eb;margin-top:40px}
footer.site .wrap{padding:28px 20px;display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;font-size:13px;color:#64748b}
footer.site a{color:#475569}footer.site a:hover{color:#0f172a}
@media(max-width:760px){.hero h1{font-size:26px}.col-date{display:none}nav.top a:not(.cta){display:none}nav.top a.cta{margin-left:0}}
.pager{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:18px 0 6px;font-size:14px}
.pager a,.pager span{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 12px;color:#475569}
.pager a:hover{border-color:#f97316;color:#0f172a}
.pager span.on{background:#fff7ed;border-color:#fdba74;color:#9a3412;font-weight:600}
`;

async function fetchCategory(db, page) {
  const q =
    `startups?select=slug,title,tagline,description,upvote_count,created_at,launch_date` +
    `&category=eq.${encodeURIComponent(db)}&is_live=eq.true&or=(archived.is.null,archived.is.false)` +
    `&order=upvote_count.desc.nullslast,created_at.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Prefer: 'count=exact' },
  });
  // Content-Range: "100-199/437" (or "*/437" on a 416) — the denominator is the exact total.
  const total = Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
  if (r.status === 416) return { items: [], total }; // offset past the end: out-of-range page
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const items = await r.json();
  return { items: Array.isArray(items) ? items : [], total };
}

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const NAV =
  `<header class="site"><div class="wrap">` +
  `<a class="brand" href="/"><span class="mark">S</span> SubmitHunt</a>` +
  `<nav class="top"><a href="/">Launches</a><a href="/directory">Directory</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a><a class="cta" href="/submit">Submit your startup</a></nav>` +
  `</div></header>`;

const FOOTER = (year) =>
  `<footer class="site"><div class="wrap">` +
  `<span>© ${year} SubmitHunt — Where founders launch and get discovered</span>` +
  `<span><a href="/">Launches</a> · <a href="/directory">Directory</a> · <a href="/blog">Blog</a> · <a href="/pricing">Pricing</a> · <a href="/llms.txt">llms.txt</a></span>` +
  `</div></footer>`;

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.status(404).send(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>Category not found — SubmitHunt</title><meta name="robots" content="noindex" /><style>${STYLES}</style></head>` +
    `<body>${NAV}<div class="wrap" style="padding:80px 20px;text-align:center"><h1 style="font-size:28px;font-weight:800">Category not found</h1>` +
    `<p style="color:#475569;margin-top:10px">Browse <a href="/" style="color:#c2410c;text-decoration:underline">today's launches</a> or pick a category:</p>` +
    `<nav class="chips" style="justify-content:center" aria-label="Product categories">${Object.entries(CATEGORIES).map(([sl, c]) => `<a href="/category/${sl}">${esc(c.name)}</a>`).join('')}</nav>` +
    `</div></body></html>`
  );
}

function pager(slug, page, pages) {
  if (pages <= 1) return '';
  const href = (p) => (p === 1 ? `/category/${slug}` : `/category/${slug}?page=${p}`);
  const parts = [];
  if (page > 1) parts.push(`<a href="${href(page - 1)}" rel="prev">← Previous</a>`);
  for (let p = 1; p <= pages; p++) parts.push(p === page ? `<span class="on">${p}</span>` : `<a href="${href(p)}">${p}</a>`);
  if (page < pages) parts.push(`<a href="${href(page + 1)}" rel="next">Next →</a>`);
  return `<nav class="pager" aria-label="Pages">${parts.join('')}</nav>`;
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  const cat = CATEGORIES[slug];
  if (!cat) return notFound(res);
  const rawPage = String((req.query && req.query.page) || '1');
  if (!/^[1-9][0-9]{0,3}$/.test(rawPage)) return notFound(res);
  const page = Number(rawPage);

  let items = [];
  let total = 0;
  let dbOk = true;
  try {
    ({ items, total } = await fetchCategory(cat.db, page));
  } catch {
    dbOk = false; // DB unavailable: still render the page (no fake counts).
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (dbOk && page > pages) return notFound(res);

  const now = new Date();
  const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const url = page === 1 ? `${SITE}/category/${slug}` : `${SITE}/category/${slug}?page=${page}`;
  const countPart = total >= 10 ? `${total} ` : '';
  const pagePart = page > 1 ? ` — Page ${page}` : '';
  const title = `${cat.h1} (${monthYear}) — ${countPart}Launches Ranked${pagePart} | SubmitHunt`;
  const desc = clip(
    `${cat.blurb} ${total ? `${total} live listings, updated daily.` : 'Updated daily.'}${page > 1 ? ` Page ${page} of ${pages}.` : ''}`,
    160
  );
  const offset = (page - 1) * PAGE_SIZE;

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description: desc,
      url,
      isPartOf: { '@type': 'WebSite', name: 'SubmitHunt', url: `${SITE}/` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: total || items.length,
      itemListElement: items.slice(0, 25).map((s, i) => ({
        '@type': 'ListItem',
        position: offset + i + 1,
        name: s.title,
        url: `${SITE}/startup/${encodeURIComponent(s.slug)}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: cat.name, item: `${SITE}/category/${slug}` },
      ],
    },
  ];

  const rows = items
    .filter((s) => s && s.slug && s.title)
    .map((s, i) => {
      const href = `/startup/${encodeURIComponent(s.slug)}`;
      const tagline = clip(s.tagline || s.description || '', 120);
      return (
        `<tr>` +
        `<td class="rank">${offset + i + 1}</td>` +
        `<td><a class="nm" href="${esc(href)}">${esc(s.title)}</a>${tagline ? `<div class="tg">${esc(tagline)}</div>` : ''}</td>` +
        `<td class="up"><span>▲</span> ${Number(s.upvote_count) || 0}</td>` +
        `<td class="dt col-date">${esc(fmtDate(s.launch_date || s.created_at))}</td>` +
        `<td><a class="view" href="${esc(href)}">View →</a></td>` +
        `</tr>`
      );
    })
    .join('');

  const chips = Object.entries(CATEGORIES)
    .map(([sl, c]) => `<a href="/category/${sl}"${sl === slug ? ' class="on"' : ''}>${esc(c.name)}</a>`)
    .join('');

  const showing = total > PAGE_SIZE ? ` · showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} by upvotes` : '';
  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}" />` +
    `<meta name="robots" content="index, follow" />` +
    `<link rel="canonical" href="${esc(url)}" />` +
    `<meta property="og:type" content="website" /><meta property="og:site_name" content="SubmitHunt" />` +
    `<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" />` +
    `<meta property="og:url" content="${esc(url)}" /><meta property="og:image" content="${OG_IMG}" />` +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" />` +
    `<meta name="twitter:description" content="${esc(desc)}" /><meta name="twitter:image" content="${OG_IMG}" />` +
    `<link rel="icon" type="image/png" sizes="32x32" href="/src/favicon_io/favicon-32x32.png" />` +
    jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('') +
    `<style>${STYLES}</style>` +
    `</head><body>` +
    NAV +
    `<main class="wrap">` +
    `<section class="hero"><h1>${esc(cat.h1)} — ${esc(monthYear)}</h1>` +
    `<p>${esc(cat.blurb)}</p>` +
    `<p class="meta">${total ? `${total} live listing${total === 1 ? '' : 's'}` : 'Live listings'}${showing} · updated daily · ranked by community upvotes</p>` +
    `</section>` +
    `<nav class="chips" aria-label="Product categories">${chips}</nav>` +
    pager(slug, page, pages) +
    `<div class="panel"><table>` +
    `<thead><tr><th></th><th>Product</th><th>Upvotes</th><th class="col-date">Launched</th><th></th></tr></thead>` +
    `<tbody>${rows || `<tr><td colspan="5" style="padding:36px 16px;text-align:center;color:#94a3b8">Listings are loading — try again in a minute.</td></tr>`}</tbody>` +
    `</table></div>` +
    pager(slug, page, pages) +
    `<div class="band"><div><h2>Building something in ${esc(cat.name)}?</h2>` +
    `<p>Submit it free — get a live listing, community feedback, and a do-follow backlink from a DR 49+ domain.</p></div>` +
    `<a class="submit" href="/submit">Submit your startup →</a></div>` +
    `<section class="seo">` +
    `<h2>How this list is ranked</h2>` +
    `<p>Every product here launched on <a href="/">SubmitHunt</a> and is ranked by upvotes from the community — makers, early adopters, and founders voting for what they actually find useful. Rankings update as new votes come in, and new launches join the list every weekday.</p>` +
    `<h2>Get your product on this page</h2>` +
    `<p><a href="/submit">Submit your product</a> in the ${esc(cat.name)} category. Free listings go live on the next available weekday and include a public product page; add our badge to your site and your listing's link becomes a do-follow backlink from this DR 49+ domain. Premium and Featured plans skip the queue and include the do-follow link — see <a href="/pricing">pricing</a>. Building your launch list? Our <a href="/directory">directory of startup submission sites</a> shows where else to submit, ranked by domain rating.</p>` +
    `</section>` +
    `</main>` +
    FOOTER(now.getUTCFullYear()) +
    `</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
