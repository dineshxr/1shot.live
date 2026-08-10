// /directory — a curated, DR-ranked directory of the best places to submit a
// startup or SaaS for backlinks and traffic (à la submitsaas.com). SubmitHunt
// is featured on top; the rest are a filterable/sortable table. Pure static
// render (no DB), self-contained CSS (Tailwind purges classes outside
// *.html/src/blog), with client JS for search/filter/sort that also works
// without JavaScript.
// Served at /directory via the rewrite to /api/directory.js in vercel.json.

const SITE = 'https://submithunt.com';

import { CATEGORIES } from './category.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---------------------------------------------------------------------------
// OUTBOUND rel POLICY — read this before touching any anchor on this page.
//
//   `dofollow`  : describes the *OTHER* site. It means "if you get listed on
//                 THAT directory, the backlink THEY give YOU is dofollow".
//                 It is purely informational content for the reader. It must
//                 NEVER be used to decide the rel attribute of the links WE
//                 emit — wiring it up would silently hand submithunt.com's link
//                 equity to ~30 sites nobody agreed to endorse.
//
//   `partner`   : describes *US*. Explicit, per-entry, opt-in. It means "we
//                 have deliberately agreed to give THIS site a dofollow link
//                 from submithunt.com". Default is absent/false → nofollow.
//                 Only add it when the site owner has actually agreed.
//
//   `sponsored` : set alongside `partner` when money or a reciprocal deal is
//                 involved — Google requires rel="sponsored" for paid links.
//
// Everything without `partner: true` stays `rel="nofollow noopener"`.
// ---------------------------------------------------------------------------
function outboundRel(d) {
  if (!d || d.partner !== true) return 'nofollow noopener';
  return d.sponsored === true ? 'sponsored noopener' : 'noopener';
}

// SubmitHunt — pinned + highlighted at the top. Rendered OUTSIDE the sortable
// table so no search/filter/sort combination can reorder or hide it. Its own
// links are internal (/submit) and therefore plain dofollow — no rel needed.
// dr: 37 — measured against the Ahrefs API on 2026-07-28. Note the rest of the
// site's marketing copy still says "DR 38+", which is now a point high.
const FEATURED = {
  name: 'SubmitHunt', url: SITE, submit: '/submit', dr: 37,
  type: 'Startup Directory', pricing: 'Free', dofollow: true,
};

// Curated submission directories. DR = approximate Ahrefs Domain Rating.
// `dr: null` = we have not measured it and make no DR claim (renders as "—"
// and always sorts to the bottom of the DR column, in both directions).
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

  // Nick Launches — the ONLY entry with `partner: true`, i.e. the only outbound
  // link on this page that is dofollow (rel="noopener", no nofollow token).
  // See outboundRel() above: `partner` is ours, `dofollow` is theirs.
  //
  // dr: 68 — independently verified against the Ahrefs API on 2026-07-28, not
  // copied from their marketing page (which happens to claim the same number).
  //
  // dofollow: true — their founder told us it's dofollow, and we checked rather
  // than take it on trust: on a live product page the outbound link to the
  // product carries rel="noreferrer noopener" with no nofollow token, so it does
  // pass equity. (Verified 2026-07-28 against nicklaunches.com/products/latinaugc/.)
  {
    name: 'Nick Launches', url: 'https://nicklaunches.com/', submit: 'https://nicklaunches.com/submit',
    dr: 68, type: 'Launchpad', pricing: 'Freemium', dofollow: true, partner: true,
  },
];

const TYPES = ['Launchpad', 'Startup Directory', 'Software Directory', 'AI Directory', 'Community', 'Media', 'Design'];

// Sort options. Value format is "<key>-<dir>" and is shared verbatim by the
// <select> and by the clickable column headers, so the two stay in sync.
const SORTS = [
  { v: 'dr-desc', label: 'DR: high → low' },
  { v: 'dr-asc', label: 'DR: low → high' },
  { v: 'name-asc', label: 'Name: A → Z' },
  { v: 'name-desc', label: 'Name: Z → A' },
  { v: 'type-asc', label: 'Type: A → Z' },
  { v: 'type-desc', label: 'Type: Z → A' },
  { v: 'price-asc', label: 'Pricing: Free first' },
  { v: 'price-desc', label: 'Pricing: Paid first' },
];

// Pricing sorts by tier, not alphabetically.
const PRICE_RANK = { Free: 0, Freemium: 1, Paid: 2 };

// Default (and server-rendered) order: DR high → low, unknown DR last.
function byDrDesc(a, b) {
  const ax = typeof a.dr === 'number' ? a.dr : null;
  const bx = typeof b.dr === 'number' ? b.dr : null;
  // Two unknown-DR entries must still fall through to the name tie-break, or the
  // server order (array order) and the client order (alphabetical) diverge and
  // rows visibly jump the moment CLIENT_JS runs. Lower-cased to match the client,
  // which compares the lower-cased data-name attribute.
  if (ax === null || bx === null) {
    return (ax === null ? 1 : 0) - (bx === null ? 1 : 0)
      || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
  return bx - ax || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

const STYLES = `
/* --hdr = header.site's rendered height (60px row + 1px bottom border). The
   sticky featured row is offset by it so it parks exactly underneath the
   sticky site header instead of overlapping it. */
:root{--hdr:61px}
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
/* Pinned SubmitHunt listing. The wrapper is what sticks: it carries a solid
   page-coloured background so table rows scroll cleanly UNDER the card and
   never peek through its rounded corners. z-index sits above the table but
   below header.site (30) so the card tucks under the site header. */
.featwrap{position:sticky;top:var(--hdr);z-index:20;background:#f8fafc;padding:14px 0 10px;margin:12px 0 2px}
.feat{background:linear-gradient(180deg,#fff7ed,#fff);background-color:#fff7ed;border:2px solid #fdba74;border-radius:16px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;box-shadow:0 10px 22px -16px rgba(15,23,42,.5)}
.feat .l{display:flex;align-items:center;gap:16px}
.feat .mark{width:52px;height:52px;border-radius:14px;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px}
.feat h2{font-size:20px;font-weight:800;display:flex;align-items:center;gap:10px}
.feat .badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9a3412;background:#ffedd5;border:1px solid #fdba74;border-radius:9999px;padding:3px 10px;white-space:nowrap}
.feat .badge.own{color:#475569;background:#f1f5f9;border-color:#e2e8f0;font-weight:600;text-transform:none;letter-spacing:0}
.feat p{color:#7c2d12;font-size:14px;margin-top:3px}
.feat .meta{color:#9a3412;font-size:13px;margin-top:6px;display:flex;gap:14px;flex-wrap:wrap}
.feat .submit{background:#f97316;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;white-space:nowrap}
.feat .submit:hover{background:#ea580c}
.controls{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 12px;align-items:center}
.controls input,.controls select{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:10px 12px;font-size:14px;color:#0f172a}
.controls input{flex:1;min-width:200px}
.controls input:focus,.controls select:focus{outline:none;border-color:#f97316}
.count{font-size:13px;color:#64748b;margin-left:auto}
/* overflow-x:auto so a table wider than the screen scrolls inside the panel
   instead of scrolling the whole page sideways (which on mobile also pushed the
   sortable column headers off-screen). */
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;padding:13px 16px;border-bottom:1px solid #eef2f6;white-space:nowrap}
thead th.sortable{cursor:pointer;-webkit-user-select:none;user-select:none}
thead th.sortable:hover{color:#475569;background:#fbfcfe}
thead th.sortable:focus-visible{outline:2px solid #f97316;outline-offset:-2px}
thead th[aria-sort=ascending],thead th[aria-sort=descending]{color:#0f172a}
thead th .ind{color:#f97316;font-size:9px;margin-left:4px;display:inline-block;min-width:8px}
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
.do{color:#166534;font-weight:600}.no{color:#94a3b8}.unk{color:#94a3b8;font-style:italic}
.na{color:#cbd5e1;font-weight:600}
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
/* Mobile: keep the pinned card sticky but make it SHORT, so it never eats the
   viewport. Same --hdr offset works because header.site keeps its 60px row. */
@media(max-width:760px){
.col-type,.col-price{display:none}
.hero h1{font-size:26px}
.featwrap{padding:10px 0 8px;margin:8px 0 2px}
.feat{padding:12px 14px;gap:12px;border-radius:12px;flex-wrap:nowrap;align-items:center}
/* min-width:0 on BOTH the flex item and its inner text column — without the
   inner one the title block keeps its content width, overflows, and the CTA
   (a later flex sibling) paints over the tail of the heading at <=380px. */
.feat .l{gap:11px;min-width:0;flex:1 1 auto}
.feat .l>div{min-width:0}
.feat .mark{width:38px;height:38px;font-size:19px;border-radius:10px;flex:none}
.feat h2{font-size:15px;gap:7px;flex-wrap:wrap;min-width:0}
.feat .badge{font-size:10px;padding:2px 8px}
.feat p,.feat .meta{display:none}
/* The full nav (4 links + CTA) is wider than a phone, which made the whole page
   scroll sideways. Drop the secondary links and keep the CTA. */
nav.top a:not(.cta){display:none}
nav.top a.cta{margin-left:0}
/* Keep the "our own site" disclosure on mobile — it is what stops a pinned,
   sticky, self-owned row from reading as an impartial #1 ranking. Shrink it
   rather than hiding it. */
.feat .badge.own{font-size:9px;padding:1px 6px}
.feat .submit{padding:9px 13px;font-size:13px;border-radius:9px;flex:none}
}
/* Narrow phones: the full CTA label no longer fits beside the title. */
@media(max-width:400px){
.feat .submit{padding:8px 11px;font-size:12px}
.feat .submit .long{display:none}
}
/* Short viewports: a sticky header + sticky featured card would eat most of the
   screen, so stop pinning. 760px (not 520) because at 600px tall the card can
   still take ~46% of the viewport once the CTA wraps. */
@media(max-height:760px){.featwrap{position:static}}
`;

function row(d, i) {
  const pricingCls = d.pricing === 'Free' ? 'free' : d.pricing === 'Paid' ? 'paid' : 'freemium';
  const prank = PRICE_RANK[d.pricing] == null ? 1 : PRICE_RANK[d.pricing];

  // Their behaviour towards us — informational only, NOT our rel attribute.
  const link = d.dofollow === true ? 'dofollow' : d.dofollow === false ? 'nofollow' : 'unknown';
  const linkCell =
    link === 'dofollow'
      ? '<span class="do">Dofollow</span>'
      : link === 'nofollow'
        ? '<span class="no">Nofollow</span>'
        : '<span class="unk" title="We have not verified what kind of link this site gives out.">Unverified</span>';

  // Our behaviour towards them — driven ONLY by the explicit `partner` opt-in.
  const rel = outboundRel(d);

  const hasDr = typeof d.dr === 'number';
  const drCell = hasDr
    ? `<b>${d.dr}</b><span class="bar" style="width:${Math.round(d.dr / 1.6)}px"></span>`
    : '<b class="na" title="We have not measured this domain, so we make no DR claim.">&mdash;</b>';

  return (
    `<tr data-name="${esc(d.name.toLowerCase())}" data-type="${esc(d.type)}" data-dr="${hasDr ? d.dr : ''}" data-prank="${prank}" data-link="${link}" data-search="${esc((d.name + ' ' + d.type + ' ' + d.pricing).toLowerCase())}">` +
    `<td class="rank">${i + 1}</td>` +
    `<td><a class="nm" href="${esc(d.url)}" target="_blank" rel="${rel}">${esc(d.name)}</a></td>` +
    `<td class="col-type"><span class="type">${esc(d.type)}</span></td>` +
    `<td class="dr">${drCell}</td>` +
    `<td class="col-price"><span class="pill ${pricingCls}">${esc(d.pricing)}</span></td>` +
    `<td>${linkCell}</td>` +
    `<td><a class="visit" href="${esc(d.url)}" target="_blank" rel="${rel}">Visit ↗</a></td>` +
    `<td><a class="sub" href="${esc(d.submit)}" target="_blank" rel="${rel}">Submit ↗</a></td>` +
    `</tr>`
  );
}

// Progressive enhancement only. The table is server-rendered already sorted by
// DR (high → low), so the page is fully usable with JS disabled.
// NOTE: `rows` is scoped to #dt tbody. The pinned SubmitHunt card lives outside
// the table on purpose, so nothing below can reorder, filter or hide it.
// ES5 only (no arrow functions, no let/const) to match the rest of the file.
const CLIENT_JS =
  "(function(){" +
  "var tb=document.querySelector('#dt tbody');if(!tb)return;" +
  "var rows=Array.prototype.slice.call(tb.querySelectorAll('tr'));" +
  "var s=document.getElementById('q'),tp=document.getElementById('tp'),lk=document.getElementById('lk'),so=document.getElementById('so'),inf=document.getElementById('inf'),emp=document.getElementById('empty');" +
  "var heads=Array.prototype.slice.call(document.querySelectorAll('#dt thead th[data-key]'));" +
  "var key='dr',dir='desc';" +
  // Unknown DR ('' in data-dr) always sinks to the bottom, in BOTH directions.
  "function drOf(r){var v=r.getAttribute('data-dr');return v===''||v===null?null:+v;}" +
  "function cmp(a,b){var r=0;" +
  "if(key==='dr'){var xa=drOf(a),xb=drOf(b);" +
  "if(xa===null||xb===null){r=(xa===null?1:0)-(xb===null?1:0);}" +
  "else{r=dir==='desc'?(xb-xa):(xa-xb);}}" +
  "else if(key==='price'){r=(+a.getAttribute('data-prank'))-(+b.getAttribute('data-prank'));if(dir==='desc')r=-r;}" +
  "else{r=(a.getAttribute('data-'+key)||'').localeCompare(b.getAttribute('data-'+key)||'');if(dir==='desc')r=-r;}" +
  "if(r===0){var da=drOf(a),db=drOf(b);r=(db===null?-1:db)-(da===null?-1:da);}" +
  "if(r===0){r=a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));}" +
  "return r;}" +
  "function marks(){for(var i=0;i<heads.length;i++){var h=heads[i],ind=h.querySelector('.ind');" +
  "if(h.getAttribute('data-key')===key){h.setAttribute('aria-sort',dir==='asc'?'ascending':'descending');if(ind)ind.textContent=dir==='asc'?'\\u25B2':'\\u25BC';}" +
  "else{h.setAttribute('aria-sort','none');if(ind)ind.textContent='';}}}" +
  "function apply(){var q=(s.value||'').toLowerCase().trim(),t=tp.value,l=lk.value,vis=[],i,r,ok;" +
  "for(i=0;i<rows.length;i++){r=rows[i];ok=true;" +
  "if(t!=='all'&&r.getAttribute('data-type')!==t)ok=false;" +
  "if(l!=='all'&&r.getAttribute('data-link')!==l)ok=false;" +
  "if(q&&r.getAttribute('data-search').indexOf(q)===-1)ok=false;" +
  "r.style.display=ok?'':'none';if(ok)vis.push(r);}" +
  "vis.sort(cmp);" +
  "for(i=0;i<vis.length;i++){tb.appendChild(vis[i]);var rk=vis[i].querySelector('.rank');if(rk)rk.textContent=(i+1);}" +
  "inf.textContent=vis.length+' director'+(vis.length===1?'y':'ies');" +
  "emp.style.display=vis.length?'none':'block';marks();}" +
  "function setSort(k,d){key=k;dir=d;if(so&&so.value!==k+'-'+d)so.value=k+'-'+d;apply();}" +
  // Honour a value the browser restored (back/bfcache) before the first paint.
  "if(so&&so.value&&so.value.indexOf('-')>0){var iv=so.value.split('-');key=iv[0];dir=iv[1];}" +
  "if(so)so.addEventListener('change',function(){var p=so.value.split('-');setSort(p[0],p[1]);});" +
  "for(var hi=0;hi<heads.length;hi++){(function(el){" +
  "var k=el.getAttribute('data-key'),df=el.getAttribute('data-def')||'asc';" +
  "function go(){setSort(k,k===key?(dir==='asc'?'desc':'asc'):df);}" +
  "el.addEventListener('click',go);" +
  "el.addEventListener('keydown',function(e){var c=e.keyCode||e.which;if(c===13||c===32){e.preventDefault();go();}});" +
  "})(heads[hi]);}" +
  "s.addEventListener('input',apply);tp.addEventListener('change',apply);lk.addEventListener('change',apply);" +
  "apply();})();";

export default async function handler(req, res) {
  // Server-rendered order == the default sort (DR high → low). Keep these in
  // sync with CLIENT_JS so a no-JS visitor sees the correct default ordering.
  const sorted = DIRECTORIES.slice().sort(byDrDesc);
  const canonical = `${SITE}/directory`;
  const title = `Startup & SaaS Submission Directories — Ranked by DR (${sorted.length + 1}) | SubmitHunt`;
  const desc = `The best directories to submit your startup or SaaS in 2026, ranked by Domain Rating. Start with SubmitHunt — a free listing and a dofollow backlink — then work down the list.`;

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url: canonical, isPartOf: { '@type': 'WebSite', name: 'SubmitHunt', url: `${SITE}/` } },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      numberOfItems: sorted.length + 1,
      // Mirrors the rendered page exactly: pinned SubmitHunt first, then the
      // table in its default DR order.
      itemListElement: [FEATURED, ...sorted].map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.name, url: d.url })),
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
  const sortOptions = SORTS.map(
    (o) => `<option value="${esc(o.v)}"${o.v === 'dr-desc' ? ' selected' : ''}>${esc(o.label)}</option>`,
  ).join('');
  const rowsHtml = sorted.map((d, i) => row(d, i)).join('');

  // Sortable column headers. `data-def` is the direction a fresh click on that
  // header uses; clicking the already-active header flips it. DR ships
  // pre-marked descending because that is the server-rendered order.
  const th = (key, label, def, cls) =>
    `<th class="sortable${cls ? ' ' + cls : ''}" data-key="${key}" data-def="${def}" tabindex="0" ` +
    `aria-sort="${key === 'dr' ? 'descending' : 'none'}" title="Sort by ${esc(label)}">${esc(label)}` +
    `<span class="ind">${key === 'dr' ? '&#9660;' : ''}</span></th>`;

  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>${esc(title)}</title>` +
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
    `<header class="site"><div class="wrap"><a class="brand" href="/"><span class="mark">S</span>SubmitHunt</a>` +
    `<nav class="top"><a href="/">Discover</a><a class="active" href="/directory">Directory</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a><a class="cta" href="/submit">Submit your startup</a></nav>` +
    `</div></header>` +
    `<main class="wrap">` +
    `<div class="hero"><h1>Startup &amp; SaaS Submission Directories</h1>` +
    `<p>${sorted.length + 1} of the best places to submit your startup or SaaS for backlinks and traffic — ranked by Ahrefs Domain Rating (DR). Submit to the high-DR ones first for the strongest SEO boost.</p></div>` +
    // Featured SubmitHunt — pinned, sticky, and deliberately OUTSIDE #dt so it
    // can never be reordered, filtered or hidden by the controls below. Badged
    // as our own listing so it reads as a placement, not an impartial ranking.
    `<div class="featwrap"><div class="feat"><div class="l"><div class="mark">S</div><div>` +
    `<h2>SubmitHunt <span class="badge">Featured</span> <span class="badge own">Our own site</span></h2>` +
    `<p>Free listing, a dofollow DR ${FEATURED.dr} backlink, and your launch in front of founders &amp; early adopters.</p>` +
    `<div class="meta"><span>DR ${FEATURED.dr}</span><span>${esc(FEATURED.type)}</span><span>Free</span><span class="do">Dofollow</span></div>` +
    `</div></div><a class="submit" href="/submit">Submit<span class="long"> your startup</span> →</a></div></div>` +
    // Controls
    `<div class="controls"><input id="q" type="search" placeholder="Search directories…" aria-label="Search directories" />` +
    `<select id="tp" aria-label="Filter by type"><option value="all">All types</option>${typeOptions}</select>` +
    `<select id="lk" aria-label="Filter by link type"><option value="all">All links</option><option value="dofollow">Dofollow</option><option value="nofollow">Nofollow</option><option value="unknown">Unverified</option></select>` +
    `<select id="so" aria-label="Sort by">${sortOptions}</select>` +
    `<span class="count" id="inf" aria-live="polite"></span></div>` +
    // Table
    `<div class="panel"><table id="dt"><thead><tr><th scope="col">#</th>` +
    th('name', 'Directory', 'asc') +
    th('type', 'Type', 'asc', 'col-type') +
    th('dr', 'DR', 'desc') +
    th('price', 'Pricing', 'asc', 'col-price') +
    `<th scope="col">Link</th><th scope="col">Visit</th><th scope="col">Submit</th></tr></thead>` +
    `<tbody>${rowsHtml}</tbody></table><div id="empty">No directories match your filters.</div></div>` +
    `<p class="note">DR (Domain Rating) values are approximate and updated periodically. A “—” in the DR column means we have not measured that domain and make no DR claim for it; “Unverified” in the Link column means we have not confirmed what kind of backlink that site gives out. Always review each directory's guidelines before submitting.</p>` +
    // Category link hub: /directory is the site's strongest indexed page after
    // the homepage, so it anchors the internal-link mesh for the programmatic
    // /category/:slug landing pages.
    `<section class="seo"><h2>Browse launches by category</h2>` +
    `<p style="display:flex;flex-wrap:wrap;gap:8px;max-width:none">` +
    Object.entries(CATEGORIES)
      .map(([slug, c]) => `<a href="/category/${slug}" style="background:#fff;border:1px solid #e2e8f0;border-radius:9999px;padding:6px 14px;font-size:13px;color:#475569;white-space:nowrap">${esc(c.name)}</a>`)
      .join('') +
    `</p></section>` +
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
