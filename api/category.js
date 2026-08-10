// /category/:slug — programmatic SEO landing pages, one per product category.
// Server-rendered standalone pages (same self-contained pattern as
// /api/directory.js): live listings for the category pulled from the DB at
// request time, ranked by upvotes, with CollectionPage/ItemList/Breadcrumb
// JSON-LD. The category set is a hand-curated allowlist (CATEGORIES below), so
// junk or empty categories never mint thin pages, and each page gets
// hand-written title/H1/intro copy instead of a mad-libs template.
//
// Unknown slug -> 404 + noindex, mirroring api/blog.js's soft-404 policy.
// Sitemap coverage comes from api/sitemap.js, which emits one URL per key in
// the same allowlist (imported from this file to stay in sync).

const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
const SITE = 'https://submithunt.com';
const MAX_ITEMS = 100;

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

// slug -> page definition. `db` must match startups.category verbatim.
// Ordered by live-listing count; the order is reused for the cross-link chips.
export const CATEGORIES = {
  'saas': {
    db: 'SaaS', name: 'SaaS Products',
    h1: 'Best New SaaS Products',
    blurb: 'Every SaaS product launched on SubmitHunt, ranked by community upvotes. B2B platforms, subscription tools, and software businesses — each with a live listing, maker details, and a link to try it.',
  },
  'ai-ml': {
    db: 'AI/ML', name: 'AI & Machine Learning Tools',
    h1: 'Best New AI Tools',
    blurb: 'New AI tools and machine-learning products launching now: assistants, generators, copilots, and AI infrastructure. Ranked by upvotes from the makers and early adopters who tried them first.',
  },
  'productivity': {
    db: 'Productivity', name: 'Productivity Tools',
    h1: 'Best New Productivity Tools',
    blurb: 'Task managers, note apps, calendars, focus tools, and workflow automations launched by indie makers — ranked by the community. Find your next productivity upgrade before it hits the mainstream.',
  },
  'marketing': {
    db: 'Marketing', name: 'Marketing Tools',
    h1: 'Best New Marketing Tools',
    blurb: 'Fresh marketing software from indie makers: SEO tools, social schedulers, email platforms, analytics, and growth utilities — ranked by upvotes, each with a live listing and maker story.',
  },
  'web-app': {
    db: 'Web App', name: 'Web Apps',
    h1: 'Best New Web Apps',
    blurb: 'Browser-based products launched on SubmitHunt — no installs, just URLs. Discover new web apps across every niche, ranked by community upvotes.',
  },
  'e-commerce': {
    db: 'E-commerce', name: 'E-commerce Tools',
    h1: 'Best New E-commerce Tools',
    blurb: 'Storefront builders, checkout tools, dropshipping utilities, and merchant analytics launched by founders — ranked by upvotes from the community.',
  },
  'developer-tools': {
    db: 'Developer Tools', name: 'Developer Tools',
    h1: 'Best New Developer Tools',
    blurb: 'APIs, CLIs, IDE extensions, deployment platforms, and code utilities built by developers for developers — ranked by upvotes from makers who actually shipped with them.',
  },
  'design': {
    db: 'Design', name: 'Design Tools',
    h1: 'Best New Design Tools',
    blurb: 'New design software from indie makers: UI kits, icon sets, mockup generators, color tools, and creative utilities — ranked by community upvotes.',
  },
  'education': {
    db: 'Education', name: 'Education Tools',
    h1: 'Best New Education Tools',
    blurb: 'Learning platforms, course builders, flashcard apps, and study tools launched on SubmitHunt — ranked by upvotes from learners and educators.',
  },
  'health-fitness': {
    db: 'Health & Fitness', name: 'Health & Fitness Apps',
    h1: 'Best New Health & Fitness Apps',
    blurb: 'Workout trackers, nutrition apps, sleep tools, and wellness products launched by indie makers — ranked by the community.',
  },
  'mobile-app': {
    db: 'Mobile App', name: 'Mobile Apps',
    h1: 'Best New Mobile Apps',
    blurb: 'iOS and Android apps launched on SubmitHunt — utilities, games, social tools, and more, ranked by upvotes from early adopters.',
  },
  'gaming': {
    db: 'Gaming', name: 'Gaming Products',
    h1: 'Best New Gaming Products',
    blurb: 'Indie games, gaming tools, and player utilities launched on SubmitHunt — ranked by community upvotes.',
  },
  'social': {
    db: 'Social', name: 'Social Apps',
    h1: 'Best New Social Apps',
    blurb: 'Community platforms, messaging tools, and social products launched by indie makers — ranked by upvotes.',
  },
  'api-service': {
    db: 'API/Service', name: 'APIs & Developer Services',
    h1: 'Best New APIs & Services',
    blurb: 'Third-party APIs, backend services, and infrastructure products launched on SubmitHunt — ranked by the developers who use them.',
  },
  'chrome-extension': {
    db: 'Chrome Extension', name: 'Chrome Extensions',
    h1: 'Best New Chrome Extensions',
    blurb: 'Browser extensions launched by indie makers — productivity boosters, dev tools, and utilities that live in your toolbar, ranked by upvotes.',
  },
};

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
`;

async function fetchCategory(db) {
  const q =
    `startups?select=slug,title,tagline,description,upvote_count,created_at,launch_date` +
    `&category=eq.${encodeURIComponent(db)}&is_live=eq.true&or=(archived.is.null,archived.is.false)` +
    `&order=upvote_count.desc.nullslast,created_at.desc&limit=${MAX_ITEMS}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      Prefer: 'count=exact',
    },
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const items = await r.json();
  // Content-Range: "0-99/337" — the denominator is the exact total.
  const range = r.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]) || items.length;
  return { items: Array.isArray(items) ? items : [], total };
}

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).send(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>Category not found — SubmitHunt</title><meta name="robots" content="noindex" /><style>${STYLES}</style></head>` +
    `<body><div class="wrap" style="padding:80px 20px;text-align:center"><h1 style="font-size:28px;font-weight:800">Category not found</h1>` +
    `<p style="color:#475569;margin-top:10px">Browse <a href="/" style="color:#c2410c;text-decoration:underline">today's launches</a> or the <a href="/directory" style="color:#c2410c;text-decoration:underline">directory</a>.</p></div></body></html>`
  );
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  const cat = CATEGORIES[slug];
  if (!cat) return notFound(res);

  let items = [];
  let total = 0;
  try {
    ({ items, total } = await fetchCategory(cat.db));
  } catch {
    // DB unavailable: still render the page shell (no fake counts).
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const url = `${SITE}/category/${slug}`;
  const countPart = total >= 10 ? `${total} ` : '';
  const title = `${cat.h1} (${monthYear}) — ${countPart}Launches Ranked | SubmitHunt`;
  const desc = clip(
    `${cat.blurb} ${total ? `${total} live listings, updated daily.` : 'Updated daily.'} Submit yours free and get a dofollow backlink.`,
    160
  );

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
        position: i + 1,
        name: s.title,
        url: `${SITE}/startup/${encodeURIComponent(s.slug)}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: cat.name, item: url },
      ],
    },
  ];

  const rows = items
    .map((s, i) => {
      const href = `/startup/${encodeURIComponent(s.slug || '')}`;
      const tagline = clip(s.tagline || s.description || '', 120);
      return (
        `<tr>` +
        `<td class="rank">${i + 1}</td>` +
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

  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}" />` +
    `<meta name="robots" content="index, follow" />` +
    `<link rel="canonical" href="${esc(url)}" />` +
    `<meta property="og:type" content="website" /><meta property="og:site_name" content="SubmitHunt" />` +
    `<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" />` +
    `<meta property="og:url" content="${esc(url)}" /><meta property="og:image" content="${SITE}/og-image.png?v=2" />` +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" />` +
    `<meta name="twitter:description" content="${esc(desc)}" /><meta name="twitter:image" content="${SITE}/og-image.png?v=2" />` +
    `<link rel="icon" type="image/png" sizes="32x32" href="/src/favicon_io/favicon-32x32.png" />` +
    jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('') +
    `<style>${STYLES}</style>` +
    `</head><body>` +
    `<header class="site"><div class="wrap">` +
    `<a class="brand" href="/"><span class="mark">S</span> SubmitHunt</a>` +
    `<nav class="top"><a href="/">Launches</a><a href="/directory">Directory</a><a href="/blog">Blog</a><a href="/stats">Stats</a><a class="cta" href="/submit">Submit your startup</a></nav>` +
    `</div></header>` +
    `<main class="wrap">` +
    `<section class="hero"><h1>${esc(cat.h1)} — ${esc(monthYear)}</h1>` +
    `<p>${esc(cat.blurb)}</p>` +
    `<p class="meta">${total ? `${total} live listing${total === 1 ? '' : 's'}` : 'Live listings'}${items.length < total ? ` · showing the top ${items.length} by upvotes` : ''} · updated daily · ranked by community upvotes</p>` +
    `</section>` +
    `<nav class="chips" aria-label="Product categories">${chips}</nav>` +
    `<div class="panel"><table>` +
    `<thead><tr><th></th><th>Product</th><th>Upvotes</th><th class="col-date">Launched</th><th></th></tr></thead>` +
    `<tbody>${rows || `<tr><td colspan="5" style="padding:36px 16px;text-align:center;color:#94a3b8">Listings are loading — try again in a minute.</td></tr>`}</tbody>` +
    `</table></div>` +
    `<div class="band"><div><h2>Building something in ${esc(cat.name)}?</h2>` +
    `<p>Submit it free — get a live listing, community feedback, and a dofollow backlink from a DR 37 domain.</p></div>` +
    `<a class="submit" href="/submit">Submit your startup →</a></div>` +
    `<section class="seo">` +
    `<h2>How this list is ranked</h2>` +
    `<p>Every product here launched on <a href="/">SubmitHunt</a> and is ranked by upvotes from the community — makers, early adopters, and founders voting for what they actually find useful. Rankings update as new votes come in, and new launches join the list every weekday.</p>` +
    `<h2>Get your product on this page</h2>` +
    `<p><a href="/submit">Submit your product</a> in the ${esc(cat.name)} category. Free listings go live on the next available weekday, include a public product page, and earn a dofollow backlink from this DR 37 domain once you add our badge. Paid plans skip the queue — see <a href="/pricing">pricing</a>. If you're building your launch list, our <a href="/directory">directory of startup submission sites</a> shows where else to submit, ranked by domain rating.</p>` +
    `</section>` +
    `</main>` +
    `<footer class="site"><div class="wrap">` +
    `<span>© ${now.getUTCFullYear()} SubmitHunt — Where founders launch and get discovered</span>` +
    `<span><a href="/">Launches</a> · <a href="/directory">Directory</a> · <a href="/blog">Blog</a> · <a href="/stats">Stats</a> · <a href="/llms.txt">llms.txt</a></span>` +
    `</div></footer>` +
    `</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
