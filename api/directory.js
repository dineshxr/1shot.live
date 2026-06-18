// Server-rendered SEO directory at /directory and /directory/:category.
// Lists every live startup as a crawlable <a> to /startup/<slug> — this is the
// internal-linking hub that lets search engines discover all startup pages.
// Self-contained CSS (Tailwind purges classes outside *.html/src/blog, so this
// page can't rely on vendor/tailwind.css). Client JS adds search/filter/sort/
// pagination over the already-rendered rows, so it works without JavaScript too.

const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
const SITE = 'https://submithunt.com';

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};
const slugify = (c) => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#f8fafc;line-height:1.5}
a{color:inherit;text-decoration:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
header.site{background:#fff;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:10}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:17px}
.brand .mark{width:26px;height:26px;border-radius:7px;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
nav.top a{color:#475569;font-size:14px;margin-left:22px}
nav.top a:hover,nav.top a.active{color:#0f172a}
.cta{background:#f97316;color:#fff!important;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:600}
.hero{padding:48px 0 26px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px}
.hero p{color:#475569;max-width:760px;font-size:16px}
.crumbs{font-size:13px;color:#94a3b8;margin-bottom:14px}
.crumbs a:hover{color:#475569}
.controls{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 14px;align-items:center}
.controls input,.controls select{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:10px 12px;font-size:14px;color:#0f172a}
.controls input{flex:1;min-width:220px}
.controls input:focus,.controls select:focus{outline:none;border-color:#f97316}
.count{font-size:13px;color:#64748b;margin-left:auto}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.chip{font-size:13px;color:#475569;background:#fff;border:1px solid #e2e8f0;border-radius:9999px;padding:6px 13px}
.chip:hover{border-color:#f97316;color:#0f172a}
.chip.active{background:#0f172a;color:#fff;border-color:#0f172a}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;padding:13px 16px;border-bottom:1px solid #eef2f6;white-space:nowrap}
tbody td{padding:13px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#fcfdff}
.rank{color:#cbd5e1;font-variant-numeric:tabular-nums;width:38px}
.name{font-weight:600;color:#0f172a}
.name:hover{color:#f97316}
.tagline{color:#94a3b8;font-size:12.5px;margin-top:2px;max-width:430px}
.cat{display:inline-block;background:#f1f5f9;color:#475569;border-radius:9999px;padding:3px 11px;font-size:12px;white-space:nowrap}
.tags{color:#94a3b8;font-size:12.5px}
.votes{font-variant-numeric:tabular-nums;color:#0f172a;font-weight:600;white-space:nowrap}
.tri{display:inline-block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #f97316;margin-right:5px;vertical-align:1px}
.visit{color:#f97316;font-weight:600;white-space:nowrap}
.visit:hover{text-decoration:underline}
.colhide{}
.pager{display:flex;align-items:center;justify-content:space-between;padding:16px 4px;gap:12px;flex-wrap:wrap}
.pager button{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:8px 16px;font-size:14px;cursor:pointer;color:#0f172a}
.pager button:disabled{opacity:.45;cursor:default}
.pager .info{font-size:13px;color:#64748b}
#dir-empty{display:none;padding:40px 16px;text-align:center;color:#94a3b8}
.seo{margin:40px 0;color:#475569;font-size:15px;max-width:820px}
.seo h2{font-size:20px;color:#0f172a;margin:22px 0 8px;font-weight:700}
footer.site{background:#fff;border-top:1px solid #e5e7eb;margin-top:40px}
footer.site .wrap{padding:28px 20px;display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;font-size:13px;color:#64748b}
footer.site a{color:#475569}footer.site a:hover{color:#0f172a}
@media(max-width:720px){.col-tags,.col-cat{display:none}.tagline{max-width:200px}.hero h1{font-size:27px}}
`;

function row(s, i) {
  const slug = s.slug;
  const name = s.title || 'Untitled';
  const cat = (s.category && String(s.category).trim()) || 'Other';
  const tagline = clip(s.tagline || s.description || '', 96);
  const tags = Array.isArray(s.tags) ? s.tags.filter(Boolean).slice(0, 3) : [];
  const votes = Number(s.upvote_count) || 0;
  const haystack = [name, tagline, cat, tags.join(' ')].join(' ').toLowerCase();
  const visit = s.url && /^https?:\/\//.test(s.url)
    ? `<a class="visit" href="${esc(s.url)}" target="_blank" rel="nofollow noopener">Visit ↗</a>`
    : '';
  return (
    `<tr data-cat="${esc(cat)}" data-name="${esc(name)}" data-votes="${votes}" data-search="${esc(haystack)}">` +
    `<td class="rank">${i + 1}</td>` +
    `<td><a class="name" href="/startup/${encodeURIComponent(slug)}">${esc(name)}</a>` +
    (tagline ? `<div class="tagline">${esc(tagline)}</div>` : '') +
    `</td>` +
    `<td class="col-cat"><span class="cat">${esc(cat)}</span></td>` +
    `<td class="col-tags tags">${esc(tags.join(', '))}</td>` +
    `<td class="votes"><span class="tri"></span>${votes}</td>` +
    `<td>${visit}</td>` +
    `</tr>`
  );
}

const CLIENT_JS =
  "(function(){var rows=Array.prototype.slice.call(document.querySelectorAll('#dir-table tbody tr'));" +
  "var s=document.getElementById('dir-search'),c=document.getElementById('dir-cat'),so=document.getElementById('dir-sort');" +
  "var pv=document.getElementById('dir-prev'),nx=document.getElementById('dir-next'),inf=document.getElementById('dir-info'),pg=document.getElementById('dir-page'),emp=document.getElementById('dir-empty');" +
  "var PER=50,page=1,filtered=rows;" +
  "function apply(){var q=(s.value||'').toLowerCase().trim();var cat=c?c.value:'all';var sort=so?so.value:'votes';" +
  "filtered=rows.filter(function(r){if(cat!=='all'&&r.getAttribute('data-cat')!==cat)return false;if(!q)return true;return r.getAttribute('data-search').indexOf(q)!==-1;});" +
  "filtered.sort(function(a,b){if(sort==='name')return a.getAttribute('data-name').toLowerCase().localeCompare(b.getAttribute('data-name').toLowerCase());return (+b.getAttribute('data-votes'))-(+a.getAttribute('data-votes'));});" +
  "page=1;render();}" +
  "function render(){var total=filtered.length,pages=Math.max(1,Math.ceil(total/PER));if(page>pages)page=pages;" +
  "rows.forEach(function(r){r.style.display='none';});var start=(page-1)*PER,end=Math.min(start+PER,total);" +
  "for(var i=start;i<end;i++){var r=filtered[i];r.style.display='';r.querySelector('.rank').textContent=(i+1);}" +
  "inf.textContent=total?('Showing '+(start+1)+'-'+end+' of '+total):'';pg.textContent='Page '+page+' of '+pages;" +
  "emp.style.display=total?'none':'block';pv.disabled=page<=1;nx.disabled=page>=pages;}" +
  "s.addEventListener('input',apply);if(c)c.addEventListener('change',apply);if(so)so.addEventListener('change',apply);" +
  "pv.addEventListener('click',function(){if(page>1){page--;render();window.scrollTo(0,0);}});" +
  "nx.addEventListener('click',function(){page++;render();window.scrollTo(0,0);});apply();})();";

function page({ canonical, title, desc, h1, intro, crumbs, chips, showCatSelect, rowsHtml, catOptions, seo, itemList }) {
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description: desc,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'SubmitHunt', url: `${SITE}/` },
    },
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: itemList },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
    },
  ];
  return (
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}" />` +
    `<link rel="canonical" href="${esc(canonical)}" />` +
    `<meta name="robots" content="index, follow" />` +
    `<meta property="og:type" content="website" /><meta property="og:title" content="${esc(title)}" />` +
    `<meta property="og:description" content="${esc(desc)}" /><meta property="og:url" content="${esc(canonical)}" />` +
    `<meta property="og:image" content="${SITE}/og-image.png" /><meta property="og:site_name" content="SubmitHunt" />` +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${SITE}/og-image.png" />` +
    `<link rel="icon" type="image/x-icon" href="/src/favicon_io/favicon.ico" />` +
    jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('') +
    `<style>${STYLES}</style></head><body>` +
    `<header class="site"><div class="wrap"><a class="brand" href="/"><span class="mark">S</span>SubmitHunt</a>` +
    `<nav class="top"><a href="/">Discover</a><a class="active" href="/directory">Directory</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a><a class="cta" href="/submit">Submit your startup</a></nav>` +
    `</div></header>` +
    `<main class="wrap">` +
    `<div class="hero">${crumbs.length > 1 ? `<div class="crumbs">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${esc(c.url)}">${esc(c.name)}</a> / ` : esc(c.name))).join('')}</div>` : ''}` +
    `<h1>${esc(h1)}</h1><p>${intro}</p></div>` +
    (chips ? `<div class="chips">${chips}</div>` : '') +
    `<div class="controls"><input id="dir-search" type="search" placeholder="Search startups…" aria-label="Search startups" />` +
    (showCatSelect ? `<select id="dir-cat" aria-label="Filter by category"><option value="all">All categories</option>${catOptions}</select>` : '') +
    `<select id="dir-sort" aria-label="Sort"><option value="votes">Most upvoted</option><option value="name">Name A–Z</option></select>` +
    `<span class="count" id="dir-info"></span></div>` +
    `<div class="panel"><table id="dir-table"><thead><tr><th>#</th><th>Startup</th><th class="col-cat">Category</th><th class="col-tags">Tags</th><th>Upvotes</th><th>Link</th></tr></thead>` +
    `<tbody>${rowsHtml}</tbody></table><div id="dir-empty">No startups match your search.</div></div>` +
    `<div class="pager"><button id="dir-prev" type="button">← Prev</button><span class="info" id="dir-page"></span><button id="dir-next" type="button">Next →</button></div>` +
    `<section class="seo">${seo}</section>` +
    `</main>` +
    `<footer class="site"><div class="wrap"><div>© ${new Date().getFullYear()} SubmitHunt — a directory for startups & AI projects.</div>` +
    `<div><a href="/">Discover</a> · <a href="/directory">Directory</a> · <a href="/submit">Submit</a> · <a href="/pricing">Pricing</a> · <a href="/blog">Blog</a></div></div></footer>` +
    `<script>${CLIENT_JS}</script></body></html>`
  );
}

export default async function handler(req, res) {
  const requested = req.query && req.query.category ? slugify(String(req.query.category)) : null;

  const all = await fetchAll(
    'startups?select=slug,title,tagline,description,category,tags,upvote_count,url,logo_url&is_live=eq.true&or=(archived.is.null,archived.is.false)&order=upvote_count.desc'
  );
  const live = all.filter((s) => s.slug);

  // Category counts for chips / select.
  const counts = {};
  for (const s of live) {
    const c = (s.category && String(s.category).trim()) || 'Other';
    counts[c] = (counts[c] || 0) + 1;
  }
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');

  // ---- Category page ----
  if (requested) {
    const matchCat = cats.find((c) => slugify(c) === requested);
    if (!matchCat) {
      res.status(404).send(
        page({
          canonical: `${SITE}/directory`,
          title: 'Category not found — SubmitHunt Directory',
          desc: 'Browse the full SubmitHunt startup directory.',
          h1: 'Category not found',
          intro: `That category does not exist. <a href="/directory" style="color:#f97316">Browse the full directory →</a>`,
          crumbs: [{ name: 'Home', url: `${SITE}/` }, { name: 'Directory', url: `${SITE}/directory` }],
          chips: '',
          showCatSelect: false,
          rowsHtml: '',
          catOptions: '',
          seo: '',
          itemList: [],
        })
      );
      return;
    }
    const items = live.filter((s) => ((s.category && String(s.category).trim()) || 'Other') === matchCat);
    const canonical = `${SITE}/directory/${slugify(matchCat)}`;
    const rowsHtml = items.map((s, i) => row(s, i)).join('');
    const itemList = items.slice(0, 30).map((s, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE}/startup/${encodeURIComponent(s.slug)}`, name: s.title,
    }));
    res.status(200).send(
      page({
        canonical,
        title: `Best ${matchCat} Startups & Tools (${comma(items.length)}) — SubmitHunt Directory`,
        desc: clip(`Browse ${comma(items.length)} ${matchCat} startups and tools on SubmitHunt. Discover, compare and visit the best ${matchCat} products — or submit your own startup for free.`, 160),
        h1: `Best ${matchCat} Startups & AI Tools`,
        intro: `Browse <strong>${comma(items.length)}</strong> ${esc(matchCat)} startups and tools submitted to SubmitHunt. Search, sort by upvotes, and click any name to see the full listing — or <a href="/submit" style="color:#f97316">submit your own</a> to get listed with a dofollow backlink.`,
        crumbs: [
          { name: 'Home', url: `${SITE}/` },
          { name: 'Directory', url: `${SITE}/directory` },
          { name: matchCat, url: canonical },
        ],
        chips: `<a class="chip" href="/directory">← All categories</a>` + cats.filter((c) => c !== matchCat).slice(0, 12).map((c) => `<a class="chip" href="/directory/${slugify(c)}">${esc(c)}</a>`).join(''),
        showCatSelect: false,
        rowsHtml,
        catOptions: '',
        seo: `<h2>About ${esc(matchCat)} on SubmitHunt</h2><p>SubmitHunt is a launch directory where founders submit startups and AI tools to get discovered and earn a dofollow backlink. This page collects every live ${esc(matchCat)} product on the platform, ranked by community upvotes. Found one you like? Open its page to read more and visit the site. Building something in ${esc(matchCat)}? <a href="/submit" style="color:#f97316">Submit your startup</a> to get listed.</p>`,
        itemList,
      })
    );
    return;
  }

  // ---- Main directory hub ----
  const canonical = `${SITE}/directory`;
  const rowsHtml = live.map((s, i) => row(s, i)).join('');
  const catOptions = cats.map((c) => `<option value="${esc(c)}">${esc(c)} (${counts[c]})</option>`).join('');
  const chips = cats.slice(0, 14).map((c) => `<a class="chip" href="/directory/${slugify(c)}">${esc(c)} <span style="color:#cbd5e1">${counts[c]}</span></a>`).join('');
  const itemList = live.slice(0, 30).map((s, i) => ({
    '@type': 'ListItem', position: i + 1, url: `${SITE}/startup/${encodeURIComponent(s.slug)}`, name: s.title,
  }));
  res.status(200).send(
    page({
      canonical,
      title: `Startup Directory — Browse ${comma(live.length)}+ Startups & AI Tools | SubmitHunt`,
      desc: clip(`Browse SubmitHunt's directory of ${comma(live.length)} live startups and AI tools across ${cats.length} categories. Discover new launches, filter by category, or submit your own startup for free.`, 160),
      h1: `Startup Directory`,
      intro: `Browse <strong>${comma(live.length)}</strong> live startups and AI tools across <strong>${cats.length}</strong> categories. Search, filter by category, sort by upvotes, and click any name for the full listing — or <a href="/submit" style="color:#f97316">submit your own startup</a> to get listed with a dofollow backlink.`,
      crumbs: [{ name: 'Home', url: `${SITE}/` }, { name: 'Directory', url: canonical }],
      chips,
      showCatSelect: true,
      rowsHtml,
      catOptions,
      seo: `<h2>What is the SubmitHunt directory?</h2><p>SubmitHunt is a Product Hunt alternative where founders submit startups and AI tools to get discovered by early adopters, investors, and other builders — and earn a dofollow backlink from a high-authority domain. This directory lists every live product on the platform, ranked by community upvotes, so you can browse the newest launches by category. <a href="/submit" style="color:#f97316">Submit your startup</a> to get listed for free.</p>`,
      itemList,
    })
  );
}
