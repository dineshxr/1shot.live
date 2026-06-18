// Dynamic Open Graph image for a startup: /api/og?slug=<slug>
// Renders a branded 1200x630 card with @vercel/og (Satori). @vercel/og is
// imported dynamically inside the try/catch so a bundling/WASM problem can
// never fail the build — on ANY failure (package missing, font/WASM issue,
// startup not found) it 302s to the startup screenshot or the site default,
// so og:image always resolves to a valid image.

const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
const SITE = 'https://submithunt.com';
const FALLBACK = `${SITE}/og-image.png`;

const h = (type, props) => ({ type, props: props || {} });
const clip = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

export default async function handler(req, res) {
  const slug = req.query && req.query.slug ? String(req.query.slug) : '';
  let s = null;
  try {
    if (slug) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/startups?select=title,tagline,description,category,upvote_count,logo_url,screenshot_url&slug=eq.${encodeURIComponent(slug)}&limit=1`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
      );
      if (r.ok) {
        const a = await r.json();
        s = a && a[0];
      }
    }
  } catch {
    s = null;
  }

  try {
    const { ImageResponse } = await import('@vercel/og');
    const name = (s && s.title) || 'SubmitHunt';
    const tagline = (s && (s.tagline || s.description)) || 'Discover and launch new startups & AI tools';
    const category = (s && s.category) || 'Startup';
    const votes = (s && Number(s.upvote_count)) || 0;
    const logo = s && s.logo_url && /^https?:\/\//.test(s.logo_url) ? s.logo_url : null;
    const initial = (name.trim().charAt(0) || 'S').toUpperCase();

    const element = h('div', {
      style: {
        height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
        background: '#ffffff', padding: '70px', fontFamily: 'sans-serif', position: 'relative',
      },
      children: [
        h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: '14px', background: '#f97316' } }),
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '26px' },
          children: [
            h('div', {
              style: { display: 'flex', alignItems: 'center' },
              children: [
                logo
                  ? h('img', { src: logo, width: 108, height: 108, style: { borderRadius: '26px', objectFit: 'cover', border: '1px solid #e5e7eb' } })
                  : h('div', {
                      style: { width: '108px', height: '108px', borderRadius: '26px', background: '#f97316', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '58px', fontWeight: 700 },
                      children: initial,
                    }),
                h('div', { style: { fontSize: '66px', fontWeight: 800, color: '#0f172a', marginLeft: '30px', lineHeight: 1.05 }, children: clip(name, 26) }),
              ],
            }),
            votes
              ? h('div', {
                  style: { display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff7ed', border: '2px solid #fed7aa', borderRadius: '20px', padding: '16px 26px' },
                  children: [
                    h('div', { style: { width: 0, height: 0, borderLeft: '15px solid transparent', borderRight: '15px solid transparent', borderBottom: '22px solid #f97316' } }),
                    h('div', { style: { fontSize: '36px', fontWeight: 800, color: '#ea580c', marginTop: '8px' }, children: String(votes) }),
                  ],
                })
              : h('div', {}),
          ],
        }),
        h('div', { style: { fontSize: '42px', color: '#475569', marginTop: '44px', lineHeight: 1.25, display: 'flex' }, children: clip(tagline, 108) }),
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
          children: [
            h('div', { style: { fontSize: '30px', color: '#0f172a', background: '#f1f5f9', borderRadius: '9999px', padding: '12px 30px', display: 'flex' }, children: clip(category, 30) }),
            h('div', { style: { fontSize: '36px', fontWeight: 800, color: '#f97316', display: 'flex' }, children: 'SubmitHunt' }),
          ],
        }),
      ],
    });

    const image = new ImageResponse(element, { width: 1200, height: 630 });
    const buffer = Buffer.from(await image.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, immutable');
    res.status(200).send(buffer);
  } catch (err) {
    const fallback = (s && (s.screenshot_url || s.logo_url)) || FALLBACK;
    res.statusCode = 302;
    res.setHeader('Location', fallback);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end();
  }
}
