// Dynamic sitemap served at /sitemap.xml (via rewrite in vercel.json).
// Always-fresh: static pages + every published blog post + every live startup
// + one page per category. Replaces the old hand-maintained sitemap.xml.

const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
const SITE = 'https://submithunt.com';

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
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    tag(`${SITE}/`, today, 'daily', '1.0'),
    tag(`${SITE}/directory`, today, 'daily', '0.9'),
    tag(`${SITE}/submit.html`, today, 'weekly', '0.9'),
    tag(`${SITE}/pricing.html`, today, 'monthly', '0.7'),
    tag(`${SITE}/featured.html`, today, 'weekly', '0.7'),
    tag(`${SITE}/blog`, today, 'weekly', '0.8'),
  ];

  try {
    const posts = await fetchAll('blog_posts?select=slug,updated_at,published_at&is_published=eq.true');
    for (const p of posts) {
      if (!p.slug) continue;
      urls.push(tag(`${SITE}/blog/${p.slug}`, day(p.updated_at || p.published_at, today), 'monthly', '0.7'));
    }

    const startups = await fetchAll(
      'startups?select=slug,updated_at,created_at,category&is_live=eq.true&or=(archived.is.null,archived.is.false)&order=upvote_count.desc'
    );
    const categories = new Set();
    for (const s of startups) {
      if (!s.slug) continue;
      urls.push(tag(`${SITE}/startup/${encodeURIComponent(s.slug)}`, day(s.updated_at || s.created_at, today), 'weekly', '0.6'));
      if (s.category && String(s.category).trim()) categories.add(String(s.category).trim());
    }
    for (const c of categories) {
      urls.push(tag(`${SITE}/directory/${slugifyCategory(c)}`, today, 'weekly', '0.7'));
    }
  } catch {
    // Degrade gracefully to the static URLs already queued.
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
