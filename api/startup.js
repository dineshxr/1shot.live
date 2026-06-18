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
  const softwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description: clip(s.description || s.tagline || `${name} on SubmitHunt`, 300),
    applicationCategory: s.category || 'BusinessApplication',
    operatingSystem: 'Web',
    url,
    image: ogImg,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isPartOf: { '@type': 'WebSite', name: 'SubmitHunt', url: `${SITE}/` },
  };
  if (s.url) softwareApp.sameAs = [s.url];
  if (Number(s.upvote_count) > 0) {
    softwareApp.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: '5',
      ratingCount: String(Math.max(1, Number(s.upvote_count))),
      bestRating: '5',
      worstRating: '1',
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
  return [softwareApp, breadcrumb, org]
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`)
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
      `${SUPABASE_URL}/rest/v1/startups?select=slug,title,tagline,description,category,tags,upvote_count,url,logo_url,screenshot_url&slug=eq.${encodeURIComponent(slug)}&limit=1`,
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
      html = html.replace(/<!-- SSR_META_START -->[\s\S]*?<!-- SSR_META_END -->/, `<!-- SSR_META_START -->${meta}\n    <!-- SSR_META_END -->`);
    } else {
      html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace('</head>', `${meta}\n  </head>`);
    }
    if (html.includes('<!-- SSR_JSONLD_START -->') && html.includes('<!-- SSR_JSONLD_END -->')) {
      html = html.replace(/<!-- SSR_JSONLD_START -->[\s\S]*?<!-- SSR_JSONLD_END -->/, `<!-- SSR_JSONLD_START -->\n    ${jsonld}\n    <!-- SSR_JSONLD_END -->`);
    } else {
      html = html.replace('</head>', `${jsonld}\n  </head>`);
    }
  }

  res.status(startup ? 200 : 404).send(html);
}
