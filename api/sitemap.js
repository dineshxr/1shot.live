// Dynamic sitemap served at /sitemap.xml (via rewrite in vercel.json).
// Always-fresh: static pages + category pages + every live startup + every
// indexable blog post. Replaces the old hand-maintained sitemap.xml.
import { CATEGORIES } from '../src/lib/categories.js';
import { isVetted } from '../src/lib/link-policy.js';
//
// Every <loc> must be the page's canonical URL (clean paths like /submit, never
// the /submit.html file the rewrite serves). <lastmod> is only emitted when we
// know it: Google ignores lastmod site-wide once it proves inaccurate, so
// static pages get none instead of "today".

const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
const SITE = 'https://www.submithunt.com';

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

const slugifyCategory = (c) =>
  String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const day = (v, fallback) => (v ? String(v).slice(0, 10) : fallback);

function tag(loc, lastmod, changefreq, priority) {
  const mod = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>${mod}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

const latest = (rows, ...fields) =>
  rows.reduce((max, r) => {
    const d = day(fields.map((f) => r[f]).find(Boolean), '');
    return d > max ? d : max;
  }, '');

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  let posts = [];
  let startups = [];
  try {
    posts = await fetchAll('blog_posts?select=slug,startup_id,updated_at,published_at&is_published=eq.true');
    startups = await fetchAll(
      'startups?select=id,slug,category,plan,backlink_verified_at,updated_at,created_at&is_live=eq.true&or=(archived.is.null,archived.is.false)&order=upvote_count.desc'
    );
  } catch {
    // Degrade gracefully to the static URLs below.
  }
  // Only indexable pages belong here: reviews of unvetted listings are
  // noindex (see reviewIndexable in api/blog.js), so leave them out.
  const vetted = new Set(startups.filter(isVetted).map((s) => s.id));
  posts = posts.filter((p) => !p.startup_id || vetted.has(p.startup_id));

  // The homepage and /blog change whenever a launch or a post does; the rest
  // only change on deploys, so they carry no lastmod.
  const urls = [
    tag(`${SITE}/`, latest(startups, 'updated_at', 'created_at') || today, 'daily', '1.0'),
    tag(`${SITE}/submit`, null, 'monthly', '0.9'),
    tag(`${SITE}/directory`, null, 'monthly', '0.8'),
    tag(`${SITE}/blog`, latest(posts, 'published_at', 'updated_at') || null, 'daily', '0.8'),
    tag(`${SITE}/featured`, null, 'weekly', '0.7'),
    tag(`${SITE}/pricing`, null, 'monthly', '0.7'),
  ];

  // Category landing pages (api/category.js); each changes when a listing in it does.
  for (const [slug, c] of Object.entries(CATEGORIES)) {
    const inCat = startups.filter((s) => s.category === c.db);
    urls.push(tag(`${SITE}/category/${slug}`, latest(inCat, 'updated_at', 'created_at') || null, 'daily', '0.8'));
  }

  for (const p of posts) {
    if (!p.slug) continue;
    urls.push(tag(`${SITE}/blog/${p.slug}`, day(p.updated_at || p.published_at, today), 'monthly', '0.7'));
  }
  for (const s of startups) {
    if (!s.slug) continue;
    urls.push(tag(`${SITE}/startup/${encodeURIComponent(s.slug)}`, day(s.updated_at || s.created_at, today), 'weekly', '0.6'));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
