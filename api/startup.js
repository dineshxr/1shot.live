// Server-side meta injection for /startup/:slug (rewritten here in vercel.json).
// Fetches the startup, injects a unique <title>, description, canonical, Open
// Graph / Twitter tags and JSON-LD into the index.html shell, then returns it.
// The Preact SPA still boots from the untouched <body> and renders the page.
// This is what makes per-startup OG images + rich results work for crawlers,
// which do not execute the client-side JS.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const stripHtml = (s) =>
  String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Cleaned FAQ pairs from the AI-prefill details column: max 8 items, HTML
// stripped, entries missing a question or answer skipped.
function faqItems(details) {
  const raw = details && typeof details === 'object' && Array.isArray(details.faq) ? details.faq : [];
  const items = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    if (typeof it.question !== 'string' || typeof it.answer !== 'string') continue;
    const question = stripHtml(it.question);
    const answer = stripHtml(it.answer);
    if (!question || !answer) continue;
    items.push({ question, answer });
    if (items.length >= 8) break;
  }
  return items;
}

let shellCache = null;
async function getShell(host) {
  if (shellCache) return shellCache;
  try {
    shellCache = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    return shellCache;
  } catch {
    /* fall through to HTTP */
  }
  try {
    const r = await fetch(`https://${host}/index.html`);
    if (r.ok) {
      shellCache = await r.text();
      return shellCache;
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

function metaBlock(s, url, ogImg, title, desc) {
  const tags = Array.isArray(s.tags) ? s.tags.filter(Boolean) : [];
  const keywords = [s.title, s.category, ...tags, 'startup', 'SubmitHunt'].filter(Boolean).join(', ');
  return `
    <title>${esc(title)}</title>
    <meta name="title" content="${esc(title)}" />
    <meta name="description" content="${esc(desc)}" />
    <meta name="keywords" content="${esc(keywords)}" />
    <meta name="author" content="SubmitHunt" />
    <meta name="robots" content="index, follow" />
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
    <meta property="og:image:alt" content="${esc(s.title)} on SubmitHunt" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${esc(url)}" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(ogImg)}" />
    <meta name="twitter:creator" content="@submithunt" />`;
}

function jsonLdBlock(s, url, ogImg) {
  const name = s.title || 'Startup';
  const details = s.details && typeof s.details === 'object' ? s.details : null;
  const softwareApp = {
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
  // Only claim a price when we actually know it: the details column records
  // the maker-declared pricing model. Anything other than 'Free' gets no
  // offers block at all — we never guess a price.
  if (details && details.pricing_model === 'Free') {
    softwareApp.offers = { '@type': 'Offer', price: '0', priceCurrency: 'USD' };
  }
  if (s.url) softwareApp.sameAs = [s.url];
  // Upvotes are like-counts, not star ratings — represent them honestly as an
  // InteractionCounter instead of a fabricated AggregateRating.
  if (Number(s.upvote_count) > 0) {
    softwareApp.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'LikeAction' },
      userInteractionCount: Number(s.upvote_count),
    };
  }
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Directory', item: `${SITE}/directory` },
      { '@type': 'ListItem', position: 3, name, item: url },
    ],
  };
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SubmitHunt',
    url: `${SITE}/`,
    logo: `${SITE}/og-image.png`,
  };
  // Deliberately NO FAQPage JSON-LD: the SPA does not render the FAQ, so the
  // schema would describe content invisible to JS-rendering crawlers — the
  // schema-not-backed-by-visible-content pattern Google penalizes. (FAQ rich
  // results have also been restricted to gov/health sites since Aug 2023, so
  // there is no upside.) The Q/A pairs still ship as plain noscript prose
  // below for non-JS AI crawlers — content, not a schema claim.
  const blocks = [softwareApp, breadcrumb, org];
  return blocks
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`)
    .join('\n    ');
}

export default async function handler(req, res) {
  const host = req.headers.host || 'submithunt.com';
  const slug =
    req.query && req.query.slug
      ? String(req.query.slug)
      : decodeURIComponent((req.url || '').split('?')[0].split('/').filter(Boolean).pop() || '');

  let startup = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/startups?select=slug,title,tagline,description,category,tags,upvote_count,url,logo_url,screenshot_url,details&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (r.ok) {
      const a = await r.json();
      startup = a && a[0];
    }
  } catch {
    startup = null;
  }

  const shell = await getShell(host);

  let title, desc, url, ogImg, meta, jsonld;
  if (startup) {
    url = `${SITE}/startup/${encodeURIComponent(startup.slug || slug)}`;
    ogImg = `${SITE}/api/og.js?slug=${encodeURIComponent(startup.slug || slug)}`;
    title = `${startup.title} — ${clip(startup.tagline || startup.category || 'Startup', 60)} | SubmitHunt`;
    desc = clip(startup.tagline || startup.description || `${startup.title} on SubmitHunt — discover, upvote and visit.`, 160);
    meta = metaBlock(startup, url, ogImg, title, desc);
    jsonld = jsonLdBlock(startup, url, ogImg);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');

  if (!shell) {
    // Shell unavailable: return a minimal document that still boots the SPA.
    const head = startup ? meta + '\n    ' + jsonld : '';
    res.status(startup ? 200 : 404).send(
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />${head}<link rel="stylesheet" href="/vendor/tailwind.css" /><link rel="stylesheet" href="/src/style.css" /></head><body><div id="app-root"></div><script type="importmap">{"imports":{"preact":"/vendor/preact.module.js","preact/hooks":"/vendor/preact-hooks.module.js","htm":"/vendor/htm.module.js","htm/preact":"/vendor/htm-preact.module.js","@supabase/supabase-js":"/vendor/supabase.esm.js"}}</script><script type="module" src="/src/main.js"></script></body></html>`
    );
    return;
  }

  let html = shell;
  if (startup) {
    if (html.includes('<!-- SSR_META_START -->') && html.includes('<!-- SSR_META_END -->')) {
      // Function replacers: interpolated content can contain $-sequences
      // ($&, $', $`) which String.replace treats as patterns in string form.
      html = html.replace(/<!-- SSR_META_START -->[\s\S]*?<!-- SSR_META_END -->/, () => `<!-- SSR_META_START -->${meta}\n    <!-- SSR_META_END -->`);
    } else {
      html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace('</head>', () => `${meta}\n  </head>`);
    }
    if (html.includes('<!-- SSR_JSONLD_START -->') && html.includes('<!-- SSR_JSONLD_END -->')) {
      html = html.replace(/<!-- SSR_JSONLD_START -->[\s\S]*?<!-- SSR_JSONLD_END -->/, () => `<!-- SSR_JSONLD_START -->\n    ${jsonld}\n    <!-- SSR_JSONLD_END -->`);
    } else {
      html = html.replace('</head>', () => `${jsonld}\n  </head>`);
    }
  }

  // Crawlable do-follow link to the listed product.
  //
  // Everything else on this page is client-rendered into #app-root, and the
  // in-app "Visit Website" control used to be a <button> calling window.open(),
  // which no crawler can follow. That meant the do-follow backlink the free
  // badge is traded for — and the paid plans are sold on — did not exist in the
  // raw HTML at all; the product URL appeared only inside JSON-LD "sameAs",
  // which is metadata and passes no equity.
  //
  // This block sits OUTSIDE #app-root so Preact's render() doesn't wipe it on
  // hydration. It is deliberately visible rather than hidden: serving a link to
  // crawlers that users can't see is cloaking. Same href, same target, shown to
  // everyone.
  if (startup && startup.url) {
    const host = String(startup.url).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    const outbound =
      `<footer class="sh-ssr-outbound" style="max-width:1120px;margin:0 auto;padding:28px 20px 44px;` +
      `font:14px/1.6 Inter,system-ui,sans-serif;color:#6b7280;">` +
      `Official website for ${esc(startup.title)}: ` +
      `<a href="${esc(startup.url)}" target="_blank" rel="noopener" ` +
      `style="color:#c2410c;font-weight:600;text-decoration:underline;text-underline-offset:2px;">${esc(host)}</a>` +
      `</footer>`;
    html = html.includes('</body>') ? html.replace('</body>', () => `${outbound}</body>`) : html + outbound;
  }

  // FAQ pairs as plain noscript prose for crawlers that don't execute JS.
  // NOT paired with FAQPage JSON-LD (see jsonLdBlock) — the SPA doesn't render
  // these, so a schema claim would describe content invisible to JS-rendering
  // crawlers. Prose for non-JS agents is supplemental content; a schema block
  // for it would be a rich-result claim we can't back. Sits OUTSIDE #app-root,
  // same as the sh-ssr-outbound footer above, so hydration doesn't wipe it.
  if (startup) {
    const faq = faqItems(startup.details && typeof startup.details === 'object' ? startup.details : null);
    if (faq.length) {
      const faqSection =
        `<noscript><section class="sh-ssr-faq" style="max-width:1120px;margin:0 auto;padding:0 20px 44px;` +
        `font:14px/1.6 Inter,system-ui,sans-serif;color:#374151;">` +
        `<h2 style="font-size:18px;margin:0 0 12px;">Frequently asked questions about ${esc(startup.title)}</h2>` +
        faq
          .map(
            (f) =>
              `<h3 style="font-size:15px;margin:16px 0 4px;">${esc(f.question)}</h3>` +
              `<p style="margin:0;">${esc(f.answer)}</p>`
          )
          .join('') +
        `</section></noscript>`;
      html = html.includes('</body>') ? html.replace('</body>', () => `${faqSection}</body>`) : html + faqSection;
    }
  }

  res.status(startup ? 200 : 404).send(html);
}
