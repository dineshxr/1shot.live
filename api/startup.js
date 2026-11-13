// Server-rendered /startup/:slug (rewritten here in vercel.json).
//
// Crawlers that don't run JavaScript used to get an empty <body> here: no
// text, no links — not even the product link a listing promises. Each live
// listing now ships its own <title>, description, canonical, Open Graph tags,
// JSON-LD and, in #ssr-root, the listing itself: description, facts, the
// product link (rel per src/lib/link-policy.js — do-follow only for Premium,
// Featured and badge-verified listings, exactly as /pricing promises), an
// excerpt of its review post, and links to the category page and to the
// listings launched around it. The Preact SPA renders the same page and
// src/main.js removes #ssr-root when it boots.
//
// Unknown slug -> 404 + noindex. Scheduled (not yet live) or archived
// listings still render for their makers but are noindex.
import {
  SITE, esc, clip, fmtDate, supaGet, getShell, injectHead, injectBody, jsonLdScripts, minimalShell,
  withRef, hostOf, neighbours, firstSentence,
} from '../lib/ssr.js';
import { CATEGORY_SLUG_BY_DB, CATEGORIES } from '../src/lib/categories.js';
import { productRel } from '../src/lib/link-policy.js';

const FIELDS =
  'id,slug,title,tagline,description,category,tags,upvote_count,url,logo_url,plan,backlink_verified_at,' +
  'launch_date,created_at,is_live,archived';

const loadStartup = async (slug) => {
  const rows = await supaGet(`startups?select=${FIELDS}&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};
const loadReview = async (id) => {
  const rows = await supaGet(`blog_posts?select=title,slug,excerpt&startup_id=eq.${encodeURIComponent(id)}&is_published=eq.true&order=published_at.asc&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

const categoryOf = (s) => {
  const slug = CATEGORY_SLUG_BY_DB[s.category];
  return slug ? { path: `/category/${slug}`, name: CATEGORIES[slug].name } : null;
};

function headMeta({ title, desc, url, ogImg, alt, keywords, noindex }) {
  return `
    <title>${esc(title)}</title>
    <meta name="title" content="${esc(title)}" />
    <meta name="description" content="${esc(desc)}" />
    ${keywords ? `<meta name="keywords" content="${esc(keywords)}" />` : ''}
    <meta name="author" content="SubmitHunt" />
    <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SubmitHunt" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${esc(ogImg)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${esc(url)}" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(ogImg)}" />
    <meta name="twitter:creator" content="@submithunt" />`;
}

function jsonLd(s, url, ogImg, cat) {
  const name = s.title || 'Startup';
  // Facts only: no invented price and no star rating (upvotes are not reviews).
  const app = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description: clip(s.description || s.tagline || `${name} on SubmitHunt`, 300),
    applicationCategory: s.category || 'BusinessApplication',
    operatingSystem: 'Web',
    url,
    image: ogImg,
    isPartOf: { '@type': 'WebSite', name: 'SubmitHunt', url: `${SITE}/` },
  };
  if (s.url) app.sameAs = [s.url];
  const crumbs = [['Home', `${SITE}/`]];
  if (cat) crumbs.push([cat.name, `${SITE}${cat.path}`]);
  crumbs.push([name, url]);
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([n, item], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item })),
  };
  return jsonLdScripts([app, breadcrumb]);
}

function body(s, { cat, review, related }) {
  const tags = Array.isArray(s.tags) ? s.tags.filter(Boolean) : [];
  const host = hostOf(s.url);
  const launched = fmtDate(s.launch_date || s.created_at);
  const fact = (label, value) =>
    value ? `<div><dt class="text-gray-500">${label}</dt><dd class="text-gray-900 font-medium">${value}</dd></div>` : '';
  const catHtml = cat ? `<a href="${cat.path}" class="underline">${esc(s.category)}</a>` : esc(s.category || '');
  return `
      <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav aria-label="Breadcrumb" class="text-xs text-gray-500 mb-6"><a href="/">Home</a> › ${cat ? `<a href="${cat.path}">${esc(cat.name)}</a> › ` : ''}<span>${esc(clip(s.title, 80))}</span></nav>
        <article class="bg-white border border-gray-200 rounded-2xl shadow-sm p-7 sm:p-10">
          <header class="flex items-center gap-4 mb-5">
            ${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="${esc(s.title)} logo" width="56" height="56" class="w-14 h-14 rounded-xl border border-gray-200 object-cover" loading="lazy" />` : ''}
            <div>
              <h1 class="text-3xl font-semibold tracking-tight text-gray-900">${esc(s.title)}</h1>
              ${s.tagline ? `<p class="text-gray-600 mt-1">${esc(s.tagline)}</p>` : ''}
            </div>
          </header>
          ${s.description ? `<p class="text-lg text-gray-700 leading-relaxed mb-6">${esc(s.description)}</p>` : ''}
          ${s.url ? `<p class="mb-8"><a href="${esc(withRef(s.url))}" target="_blank" rel="${productRel(s)}" class="inline-block bg-gray-900 text-white px-5 py-2.5 rounded-lg font-semibold">Visit ${esc(host || s.title)}</a></p>` : ''}
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            ${fact('Category', catHtml)}
            ${fact('Launched on SubmitHunt', esc(launched))}
            ${fact('Upvotes', String(Number(s.upvote_count) || 0))}
            ${fact('Website', esc(host))}
            ${tags.length ? `<div class="col-span-2"><dt class="text-gray-500">Tags</dt><dd class="text-gray-900">${tags.map(esc).join(', ')}</dd></div>` : ''}
          </dl>
          ${review ? `
          <section class="border-t border-gray-200 pt-6 mt-8">
            <h2 class="text-lg font-semibold text-gray-900 mb-2">From our review</h2>
            ${review.excerpt ? `<p class="text-gray-700 mb-3">${esc(review.excerpt)}</p>` : ''}
            <a href="/blog/${esc(encodeURIComponent(review.slug))}" class="underline">${esc(review.title)}</a>
          </section>` : ''}
        </article>
        ${related.length ? `
        <section class="mt-10">
          <h2 class="text-xl font-semibold text-gray-900 mb-4">More ${esc(cat ? cat.name : s.category ? `${s.category} launches` : 'launches')} on SubmitHunt</h2>
          <ul class="space-y-3">${related.map((r) => `
            <li><a href="/startup/${esc(encodeURIComponent(r.slug))}" class="font-medium text-gray-900 underline">${esc(r.title)}</a>${r.tagline || r.description ? ` <span class="text-gray-600">— ${esc(clip(r.tagline || r.description, 110))}</span>` : ''}</li>`).join('')}
          </ul>
          ${cat ? `<p class="mt-4 text-sm"><a href="${cat.path}" class="underline">Browse all ${esc(cat.name)}</a></p>` : ''}
        </section>` : ''}
        <p class="mt-10 text-center text-sm text-gray-600">Building something? <a href="/submit" class="underline">Submit your startup</a> — free listings go live on the next open weekday. See <a href="/pricing" class="underline">pricing</a>.</p>
      </main>`;
}

export default async function handler(req, res) {
  const host = req.headers.host || 'www.submithunt.com';
  const slug =
    req.query && req.query.slug
      ? String(req.query.slug)
      : decodeURIComponent((req.url || '').split('?')[0].split('/').filter(Boolean).pop() || '');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const [s, shell] = await Promise.all([slug ? loadStartup(slug) : null, getShell(host)]);

  if (!s) {
    const meta = headMeta({
      title: 'Startup not found | SubmitHunt',
      desc: 'This listing does not exist or has been removed.',
      url: `${SITE}/startup/${encodeURIComponent(slug)}`,
      ogImg: `${SITE}/og-image.png?v=49`,
      alt: 'SubmitHunt',
      noindex: true,
    });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(404).send(shell ? injectHead(shell, meta, '<!-- no structured data on 404s -->') : minimalShell(meta));
  }

  const live = s.is_live === true && s.archived !== true;
  const url = `${SITE}/startup/${encodeURIComponent(s.slug)}`;
  const ogImg = `${SITE}/api/og.js?slug=${encodeURIComponent(s.slug)}`;
  const cat = categoryOf(s);
  const sub = s.tagline || firstSentence(s.description) || s.category || 'Startup';
  const title = `${s.title} — ${clip(sub, 60)} | SubmitHunt`;
  let desc = clip(s.tagline || s.description || `${s.title} on SubmitHunt.`, 160);
  if (desc.length < 90 && s.category) desc = clip(`${desc} A ${s.category} product launched on SubmitHunt.`, 160);
  const tags = Array.isArray(s.tags) ? s.tags.filter(Boolean) : [];
  const meta = headMeta({
    title, desc, url, ogImg,
    alt: `${s.title} on SubmitHunt`,
    keywords: [s.title, s.category, ...tags, 'startup', 'SubmitHunt'].filter(Boolean).join(', '),
    noindex: !live,
  });
  const jsonld = jsonLd(s, url, ogImg, cat);

  // Scheduled/archived listings: head only (noindex); the SPA still renders them.
  let ssrHtml = '';
  if (live) {
    const [review, related] = await Promise.all([loadReview(s.id), neighbours(s, 8)]);
    ssrHtml = body(s, { cat, review, related });
  }

  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  const page = shell ? injectHead(shell, meta, jsonld) : null;
  return res
    .status(200)
    .send(page ? (ssrHtml ? injectBody(page, ssrHtml) : page) : minimalShell(meta + jsonld, ssrHtml));
}
