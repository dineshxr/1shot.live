// /directory — a curated, DR-ranked directory of the best places to submit a
// startup or SaaS for backlinks and traffic (à la submitsaas.com). SubmitHunt
// is featured on top; the rest are a filterable/sortable table. Pure static
// render (no DB), self-contained CSS (Tailwind purges classes outside
// *.html/src/blog), with client JS for search/filter/sort that also works
// without JavaScript.
// Served at /directory via the rewrite to /api/directory.js in vercel.json.

const SITE = 'https://submithunt.com';

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// SubmitHunt — pinned + highlighted at the top.
const FEATURED = {
  name: 'SubmitHunt', url: SITE, submit: '/submit', dr: 38,
  type: 'Startup Directory', pricing: 'Free', dofollow: true,
};

// Curated submission directories. DR = approximate Ahrefs Domain Rating.
const DIRECTORIES = [
  { name: 'GitHub', url: 'https://github.com', submit: 'https://github.com/new', dr: 96, type: 'Community', pricing: 'Free', dofollow: true },
  { name: 'Medium', url: 'https://medium.com', submit: 'https://medium.com/new-story', dr: 94, type: 'Media', pricing: 'Free', dofollow: false },
  { name: 'SourceForge', url: 'https://sourceforge.net', submit: 'https://sourceforge.net/create/', dr: 92, type: 'Software Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Product Hunt', url: 'https://www.producthunt.com', submit: 'https://www.producthunt.com/posts/new', dr: 91, type: 'Launchpad', pricing: 'Free', dofollow: false },
  { name: 'Hacker News (Show HN)', url: 'https://news.ycombinator.com', submit: 'https://news.ycombinator.com/submit', dr: 91, type: 'Community', pricing: 'Free', dofollow: false },
  { name: 'Reddit', url: 'https://www.reddit.com', submit: 'https://www.reddit.com/submit', dr: 91, type: 'Community', pricing: 'Free', dofollow: false },
  { name: 'Crunchbase', url: 'https://www.crunchbase.com', submit: 'https://www.crunchbase.com/register', dr: 91, type: 'Startup Directory', pricing: 'Freemium', dofollow: false },
  { name: 'G2', url: 'https://www.g2.com', submit: 'https://www.g2.com/products/new', dr: 90, type: 'Software Directory', pricing: 'Freemium', dofollow: false },
  { name: 'Capterra', url: 'https://www.capterra.com', submit: 'https://www.capterra.com/vendors/sign-up', dr: 90, type: 'Software Directory', pricing: 'Paid', dofollow: false },
  { name: 'DEV Community', url: 'https://dev.to', submit: 'https://dev.to/new', dr: 90, type: 'Community', pricing: 'Free', dofollow: true },
  { name: 'Softpedia', url: 'https://www.softpedia.com', submit: 'https://www.softpedia.com/get/submit.shtml', dr: 88, type: 'Software Directory', pricing: 'Free', dofollow: true },
  { name: 'AlternativeTo', url: 'https://alternativeto.net', submit: 'https://alternativeto.net/manage/submit-app/', dr: 88, type: 'Software Directory', pricing: 'Free', dofollow: true },
  { name: 'Wellfound (AngelList)', url: 'https://wellfound.com', submit: 'https://wellfound.com/company/new', dr: 88, type: 'Startup Directory', pricing: 'Free', dofollow: false },
  { name: 'GetApp', url: 'https://www.getapp.com', submit: 'https://vendors.gartner.com', dr: 82, type: 'Software Directory', pricing: 'Paid', dofollow: false },
  { name: 'Hacker Noon', url: 'https://hackernoon.com', submit: 'https://app.hackernoon.com', dr: 80, type: 'Media', pricing: 'Free', dofollow: false },
  { name: 'StackShare', url: 'https://stackshare.io', submit: 'https://stackshare.io/tools/new', dr: 78, type: 'Software Directory', pricing: 'Free', dofollow: false },
  { name: 'F6S', url: 'https://www.f6s.com', submit: 'https://www.f6s.com/companies/add', dr: 78, type: 'Startup Directory', pricing: 'Free', dofollow: true },
  { name: 'Indie Hackers', url: 'https://www.indiehackers.com', submit: 'https://www.indiehackers.com/products', dr: 76, type: 'Community', pricing: 'Free', dofollow: true },
  { name: 'Slant', url: 'https://www.slant.co', submit: 'https://www.slant.co', dr: 76, type: 'Software Directory', pricing: 'Free', dofollow: false },
  { name: 'BetaList', url: 'https://betalist.com', submit: 'https://betalist.com/submit', dr: 73, type: 'Launchpad', pricing: 'Freemium', dofollow: true },
  { name: 'Land-book', url: 'https://land-book.com', submit: 'https://land-book.com/submit', dr: 73, type: 'Design', pricing: 'Free', dofollow: true },
  { name: 'SaaSworthy', url: 'https://www.saasworthy.com', submit: 'https://www.saasworthy.com/list-software', dr: 72, type: 'Software Directory', pricing: 'Freemium', dofollow: true },
  { name: "There's An AI For That", url: 'https://theresanaiforthat.com', submit: 'https://theresanaiforthat.com/submit/', dr: 72, type: 'AI Directory', pricing: 'Paid', dofollow: true },
  { name: 'Futurepedia', url: 'https://www.futurepedia.io', submit: 'https://www.futurepedia.io/submit-tool', dr: 71, type: 'AI Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Startup Stash', url: 'https://startupstash.com', submit: 'https://startupstash.com/add-listing/', dr: 71, type: 'Startup Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Toolify', url: 'https://www.toolify.ai', submit: 'https://www.toolify.ai/submit', dr: 65, type: 'AI Directory', pricing: 'Freemium', dofollow: true },
  { name: 'SaaSHub', url: 'https://www.saashub.com', submit: 'https://www.saashub.com/submit', dr: 64, type: 'Software Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Future Tools', url: 'https://www.futuretools.io', submit: 'https://www.futuretools.io/submit-a-tool', dr: 64, type: 'AI Directory', pricing: 'Free', dofollow: false },
  { name: 'Peerlist', url: 'https://peerlist.io', submit: 'https://peerlist.io/scout', dr: 62, type: 'Community', pricing: 'Free', dofollow: true },
  { name: 'Betapage', url: 'https://betapage.co', submit: 'https://betapage.co/submit-startup', dr: 60, type: 'Startup Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Launching Next', url: 'https://www.launchingnext.com', submit: 'https://www.launchingnext.com/submit/', dr: 55, type: 'Startup Directory', pricing: 'Freemium', dofollow: true },
  { name: 'SideProjectors', url: 'https://www.sideprojectors.com', submit: 'https://www.sideprojectors.com/project/submit', dr: 53, type: 'Startup Directory', pricing: 'Free', dofollow: true },
  { name: 'Fazier', url: 'https://fazier.com', submit: 'https://fazier.com/submit', dr: 52, type: 'Launchpad', pricing: 'Freemium', dofollow: true },
  { name: 'TopAI.tools', url: 'https://topai.tools', submit: 'https://topai.tools/submit', dr: 51, type: 'AI Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Uneed', url: 'https://www.uneed.best', submit: 'https://www.uneed.best/submit-a-tool', dr: 50, type: 'Launchpad', pricing: 'Freemium', dofollow: true },
  { name: '10words', url: 'https://10words.io', submit: 'https://10words.io/submit', dr: 50, type: 'Startup Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Dang.ai', url: 'https://dang.ai', submit: 'https://dang.ai/submit', dr: 47, type: 'AI Directory', pricing: 'Freemium', dofollow: true },
  { name: 'Startups.fyi', url: 'https://www.startups.fyi', submit: 'https://www.startups.fyi/submit', dr: 46, type: 'Startup Directory', pricing: 'Freemium', dofollow: true },
  { name: 'MicroLaunch', url: 'https://microlaunch.net', submit: 'https://microlaunch.net/submit', dr: 45, type: 'Launchpad', pricing: 'Freemium', dofollow: true },
  { name: 'NoCode List', url: 'https://nocodelist.co', submit: 'https://nocodelist.co/submit', dr: 45, type: 'Software Directory', pricing: 'Free', dofollow: true },
  { name: 'Awesome Indie', url: 'https://awesomeindie.com', submit: 'https://awesomeindie.com/submit', dr: 44, type: 'Startup Directory', pricing: 'Free', dofollow: true },
  { name: 'Tiny Launch', url: 'https://www.tinylaun.ch', submit: 'https://www.tinylaun.ch', dr: 42, type: 'Launchpad', pricing: 'Freemium', dofollow: true },
  { name: 'AI Tool Hunt', url: 'https://www.aitoolhunt.com', submit: 'https://www.aitoolhunt.com/submit', dr: 41, type: 'AI Directory', pricing: 'Free', dofollow: true },
  { name: 'PitchWall', url: 'https://pitchwall.co', submit: 'https://pitchwall.co/submit', dr: 40, type: 'Startup Directory', pricing: 'Free', dofollow: true },
  { name: 'Insanely Cool Tools', url: 'https://insanelycooltools.com', submit: 'https://insanelycooltools.com/submit-a-tool/', dr: 40, type: 'Software Directory', pricing: 'Freemium', dofollow: true },
];

const TYPES = ['Launchpad', 'Startup Directory', 'Software Directory', 'AI Directory', 'Community', 'Media', 'Design'];

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
.hero{padding:46px 0 8px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px}
.hero p{color:#475569;max-width:760px;font-size:16px}
.feat{margin:26px 0 8px;background:linear-gradient(180deg,#fff7ed,#fff);border:2px solid #fdba74;border-radius:16px;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.feat .l{display:flex;align-items:center;gap:16px}
.feat .mark{width:52px;height:52px;border-radius:14px;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px}
.feat h2{font-size:20px;font-weight:800;display:flex;align-items:center;gap:10px}
.feat .badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9a3412;background:#ffedd5;border:1px solid #fdba74;border-radius:9999px;padding:3px 10px}
.feat p{color:#7c2d12;font-size:14px;margin-top:3px}
.feat .meta{color:#9a3412;font-size:13px;margin-top:6px;display:flex;gap:14px;flex-wrap:wrap}
.feat .submit{background:#f97316;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;white-space:nowrap}
.feat .submit:hover{background:#ea580c}
.controls{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 12px;align-items:center}
.controls input,.controls select{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:10px 12px;font-size:14px;color:#0f172a}
.controls input{flex:1;min-width:200px}
.controls input:focus,.controls select:focus{outline:none;border-color:#f97316}
.count{font-size:13px;color:#64748b;margin-left:auto}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;padding:13px 16px;border-bottom:1px solid #eef2f6;white-space:nowrap}
tbody td{padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#fcfdff}
.rank{color:#cbd5e1;font-variant-numeric:tabular-nums;width:34px}
.nm{font-weight:600;color:#0f172a}
.nm:hover{color:#f97316}
.dr{font-variant-numeric:tabular-nums;font-weight:700}
.dr b{display:inline-block;min-width:30px}
.bar{display:inline-block;height:6px;border-radius:3px;background:#f97316;vertical-align:middle;margin-left:8px;opacity:.85}
.type{display:inline-block;background:#f1f5f9;color:#475569;border-radius:9999px;padding:3px 11px;font-size:12px;white-space:nowrap}
.pill{display:inline-block;border-radius:9999px;padding:2px 9px;font-size:12px;font-weight:600}
.free{background:#dcfce7;color:#166534}.freemium{background:#e0f2fe;color:#075985}.paid{background:#f1f5f9;color:#475569}
.do{color:#166534;font-weight:600}.no{color:#94a3b8}
.visit,.sub{font-weight:600;white-space:nowrap}
.visit{color:#475569}.visit:hover{color:#0f172a}
.sub{color:#f97316}.sub:hover{text-decoration:underline}
#empty{display:none;padding:36px 16px;text-align:center;color:#94a3b8}
.note{font-size:12px;color:#94a3b8;margin:12px 2px 0}
.seo{margin:36px 0;color:#475569;font-size:15px;max-width:820px}
.seo h2{font-size:20px;color:#0f172a;margin:22px 0 8px;font-weight:700}
footer.site{background:#fff;border-top:1px solid #e5e7eb;margin-top:40px}
footer.site .wrap{padding:28px 20px;display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;font-size:13px;color:#64748b}
footer.site a{color:#475569}footer.site a:hover{color:#0f172a}
@media(max-width:760px){.col-type,.col-price{display:none}.hero h1{font-size:26px}.feat{flex-direction:column;align-items:flex-start}}
`;

function row(d, i) {
  const cls = 'free';
  const pricingCls = d.pricing === 'Free' ? 'free' : d.pricing === 'Paid' ? 'paid' : 'freemium';
  return (
    `<tr data-name="${esc(d.name.toLowerCase())}" data-type="${esc(d.type)}" data-dr="${d.dr}" data-link="${d.dofollow ? 'dofollow' : 'nofollow'}" data-search="${esc((d.name + ' ' + d.type).toLowerCase())}">` +
    `<td class="rank">${i + 1}</td>` +
    `<td><a class="nm" href="${esc(d.url)}" target="_blank" rel="nofollow noopener">${esc(d.name)}</a></td>` +
    `<td class="col-type"><span class="type">${esc(d.type)}</span></td>` +
    `<td class="dr"><b>${d.dr}</b><span class="bar" style="width:${Math.round(d.dr / 1.6)}px"></span></td>` +
    `<td class="col-price"><span class="pill ${pricingCls}">${esc(d.pricing)}</span></td>` +
    `<td>${d.dofollow ? '<span class="do">Dofollow</span>' : '<span class="no">Nofollow</span>'}</td>` +
    `<td><a class="visit" href="${esc(d.url)}" target="_blank" rel="nofollow noopener">Visit ↗</a></td>` +
    `<td><a class="sub" href="${esc(d.submit)}" target="_blank" rel="nofollow noopener">Submit ↗</a></td>` +
    `</tr>`
  );
}

const CLIENT_JS =
  "(function(){var rows=Array.prototype.slice.call(document.querySelectorAll('#dt tbody tr'));" +
  "var s=document.getElementById('q'),tp=document.getElementById('tp'),lk=document.getElementById('lk'),so=document.getElementById('so'),inf=document.getElementById('inf'),emp=document.getElementById('empty');" +
  "function apply(){var q=(s.value||'').toLowerCase().trim(),t=tp.value,l=lk.value,sort=so.value,vis=[];" +
  "rows.forEach(function(r){var ok=true;if(t!=='all'&&r.getAttribute('data-type')!==t)ok=false;if(l!=='all'&&r.getAttribute('data-link')!==l)ok=false;if(q&&r.getAttribute('data-search').indexOf(q)===-1)ok=false;r.style.display=ok?'':'none';if(ok)vis.push(r);});" +
  "vis.sort(function(a,b){if(sort==='name')return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));return (+b.getAttribute('data-dr'))-(+a.getAttribute('data-dr'));});" +
  "var tb=document.querySelector('#dt tbody');vis.forEach(function(r,i){tb.appendChild(r);r.querySelector('.rank').textContent=(i+1);});" +
  "inf.textContent=vis.length+' director'+(vis.length===1?'y':'ies');emp.style.display=vis.length?'none':'block';}" +
  "s.addEventListener('input',apply);tp.addEventListener('change',apply);lk.addEventListener('change',apply);so.addEventListener('change',apply);apply();})();";

export default async function handler(req, res) {
  const sorted = DIRECTORIES.slice().sort((a, b) => b.dr - a.dr);
  const canonical = `${SITE}/directory`;
  const title = `Startup & SaaS Submission Directories — Ranked by DR (${sorted.length + 1}) | SubmitHunt`;
  const desc = `The best directories to submit your startup or SaaS in 2026, ranked by Domain Rating. Start with SubmitHunt — a free listing and a dofollow backlink — then work down the list.`;

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url: canonical, isPartOf: { '@type': 'WebSite', name: 'SubmitHunt', url: `${SITE}/` } },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: [FEATURED, ...sorted].slice(0, 30).map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.name, url: d.url })),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Directory', item: canonical },
      ],
    },
  ];

  const typeOptions = TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const rowsHtml = sorted.map((d, i) => row(d, i)).join('');

  const html =
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
    `<div class="hero"><h1>Startup &amp; SaaS Submission Directories</h1>` +
    `<p>${sorted.length + 1} of the best places to submit your startup or SaaS for backlinks and traffic — ranked by Ahrefs Domain Rating (DR). Submit to the high-DR ones first for the strongest SEO boost.</p></div>` +
    // Featured SubmitHunt
    `<div class="feat"><div class="l"><div class="mark">S</div><div>` +
    `<h2>SubmitHunt <span class="badge">Start here</span></h2>` +
    `<p>Free listing, a dofollow DR ${FEATURED.dr} backlink, and your launch in front of thousands of founders &amp; early adopters.</p>` +
    `<div class="meta"><span>DR ${FEATURED.dr}</span><span>${FEATURED.type}</span><span>Free</span><span class="do">Dofollow</span></div>` +
    `</div></div><a class="submit" href="/submit">Submit your startup →</a></div>` +
    // Controls
    `<div class="controls"><input id="q" type="search" placeholder="Search directories…" aria-label="Search directories" />` +
    `<select id="tp" aria-label="Filter by type"><option value="all">All types</option>${typeOptions}</select>` +
    `<select id="lk" aria-label="Filter by link type"><option value="all">All links</option><option value="dofollow">Dofollow</option><option value="nofollow">Nofollow</option></select>` +
    `<select id="so" aria-label="Sort"><option value="dr">Highest DR</option><option value="name">Name A–Z</option></select>` +
    `<span class="count" id="inf"></span></div>` +
    // Table
    `<div class="panel"><table id="dt"><thead><tr><th>#</th><th>Directory</th><th class="col-type">Type</th><th>DR</th><th class="col-price">Pricing</th><th>Link</th><th>Visit</th><th>Submit</th></tr></thead>` +
    `<tbody>${rowsHtml}</tbody></table><div id="empty">No directories match your filters.</div></div>` +
    `<p class="note">DR (Domain Rating) values are approximate and updated periodically. Always review each directory's guidelines before submitting.</p>` +
    // SEO copy
    `<section class="seo"><h2>How to use this directory list</h2>` +
    `<p>Submitting your startup to directories is one of the fastest ways to earn your first backlinks, referral traffic, and a brand presence in search. Work down this list from the highest Domain Rating, prioritising <strong>dofollow</strong> directories that pass SEO value. Start with <a href="/submit" style="color:#f97316">SubmitHunt</a> for a free dofollow listing, then read our guides on <a href="/blog/list-your-startup" style="color:#f97316">listing your startup</a>, <a href="/blog/saas-directory-submission" style="color:#f97316">SaaS directory submission</a>, and <a href="/blog/startup-link-submission" style="color:#f97316">startup link submission</a>.</p>` +
    `<h2>Dofollow vs nofollow</h2><p>Dofollow links pass authority to your domain; nofollow links still bring traffic and keep your link profile natural. A healthy profile has both — so don't skip high-traffic nofollow sites like Product Hunt or Hacker News.</p></section>` +
    `</main>` +
    `<footer class="site"><div class="wrap"><div>© ${new Date().getFullYear()} SubmitHunt — submit your startup &amp; get a dofollow backlink.</div>` +
    `<div><a href="/">Discover</a> · <a href="/directory">Directory</a> · <a href="/submit">Submit</a> · <a href="/pricing">Pricing</a> · <a href="/blog">Blog</a></div></div></footer>` +
    `<script>${CLIENT_JS}</script></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
