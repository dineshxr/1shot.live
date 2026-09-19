// Shared server-side rendering helpers for the Vercel functions that serve
// crawler-visible HTML (api/startup.js, api/blog.js). They fill the shell's
// <!-- SSR_META --> / <!-- SSR_JSONLD --> markers and can prepend a
// server-rendered #ssr-root to <body>; the Preact SPA still boots from the
// shell and src/main.js removes #ssr-root the moment it takes over.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Canonical host. The apex domain 308s here (Vercel domain config), so every
// canonical, sitemap and Open Graph URL must use www or cost crawlers a hop.
export const SITE = 'https://www.submithunt.com';

export const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
export const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';

export const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const clip = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

export const stripTags = (html) =>
  String(html == null ? '' : html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
};

// GET a PostgREST path with the anon key; null on any failure.
export async function supaGet(pathAndQuery) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

let shellCache = null;
// index.html is bundled with the functions (vercel.json includeFiles); fall
// back to fetching it over HTTP, then to null (callers render a minimal doc).
export async function getShell(host) {
  if (shellCache) return shellCache;
  try {
    shellCache = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    return shellCache;
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`https://${host}/index.html`);
    if (r.ok) {
      shellCache = await r.text();
      return shellCache;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function injectHead(html, meta, jsonld) {
  if (meta) {
    if (html.includes('<!-- SSR_META_START -->') && html.includes('<!-- SSR_META_END -->')) {
      html = html.replace(/<!-- SSR_META_START -->[\s\S]*?<!-- SSR_META_END -->/, `<!-- SSR_META_START -->${meta}\n    <!-- SSR_META_END -->`);
    } else {
      html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace('</head>', `${meta}\n  </head>`);
    }
  }
  if (jsonld) {
    if (html.includes('<!-- SSR_JSONLD_START -->') && html.includes('<!-- SSR_JSONLD_END -->')) {
      html = html.replace(/<!-- SSR_JSONLD_START -->[\s\S]*?<!-- SSR_JSONLD_END -->/, `<!-- SSR_JSONLD_START -->\n    ${jsonld}\n    <!-- SSR_JSONLD_END -->`);
    } else {
      html = html.replace('</head>', `${jsonld}\n  </head>`);
    }
  }
  return html;
}

// Prepend server-rendered markup to <body>. src/main.js removes #ssr-root
// once the SPA renders, so JS users never see it twice.
export function injectBody(html, ssrHtml) {
  const marker = '<div id="app-root"></div>';
  return html.includes(marker)
    ? html.replace(marker, `<div id="ssr-root">${ssrHtml}</div>\n    ${marker}`)
    : html.replace('<body>', `<body>\n    <div id="ssr-root">${ssrHtml}</div>`);
}

export const jsonLdScripts = (objects) =>
  objects.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n    ');

// Minimal document used only when the shell cannot be read; still boots the SPA.
export function minimalShell(head, ssrHtml = '') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />${head}<link rel="stylesheet" href="/vendor/tailwind.css" /><link rel="stylesheet" href="/src/style.css" /></head><body>${ssrHtml ? `<div id="ssr-root">${ssrHtml}</div>` : ''}<div id="app-root"></div><script type="importmap">{"imports":{"preact":"/vendor/preact.module.js","preact/hooks":"/vendor/preact-hooks.module.js","htm":"/vendor/htm.module.js","htm/preact":"/vendor/htm-preact.module.js","@supabase/supabase-js":"/vendor/supabase.esm.js"}}</script><script type="module" src="/src/main.js"></script></body></html>`;
}
