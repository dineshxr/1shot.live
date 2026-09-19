// Server-rendered blog: /blog and /blog/:slug (rewritten here in vercel.json).
//
// Crawlers that do not execute JavaScript — most AI bots — used to receive
// the bare homepage shell for all 500+ posts. Each post now ships its own
// <title>, description, canonical, Open Graph tags, BlogPosting JSON-LD and
// the full article HTML in #ssr-root; the Preact SPA replaces that block when
// it boots (src/main.js). The index lists the latest posts the same way.
import {
  SITE, esc, clip, stripTags, fmtDate, supaGet, getShell, injectHead, injectBody, jsonLdScripts, minimalShell,
} from '../lib/ssr.js';

const BLOG_URL = `${SITE}/blog`;
const OG_IMG = `${SITE}/og-image.png`;
const POST_FIELDS = 'id,startup_id,title,slug,content,excerpt,meta_description,keywords,author_name,published_at,updated_at,category';
const INDEX_LIMIT = 100;

const loadPost = async (slug) => {
  const rows = await supaGet(`blog_posts?select=${POST_FIELDS}&slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};
const loadStartup = async (id) => {
  if (!id) return null;
  const rows = await supaGet(`startups?select=slug,title,tagline&id=eq.${encodeURIComponent(id)}&is_live=eq.true&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};
const loadIndex = async () => {
  const rows = await supaGet(`blog_posts?select=title,slug,excerpt,published_at,category&is_published=eq.true&order=published_at.desc&limit=${INDEX_LIMIT}`);
  return Array.isArray(rows) ? rows.filter((p) => p.slug && p.title) : [];
};

function headMeta({ title, desc, url, type = 'website', published, modified, keywords, noindex = false }) {
  return `
    <title>${esc(title)}</title>
    <meta name="title" content="${esc(title)}" />
    <meta name="description" content="${esc(desc)}" />
    ${keywords ? `<meta name="keywords" content="${esc(keywords)}" />` : ''}
    <meta name="author" content="SubmitHunt" />
    <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="SubmitHunt" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${OG_IMG}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    ${published ? `<meta property="article:published_time" content="${esc(published)}" />` : ''}
    ${modified ? `<meta property="article:modified_time" content="${esc(modified)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${esc(url)}" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${OG_IMG}" />
    <meta name="twitter:creator" content="@submithunt" />`;
}

const org = { '@type': 'Organization', name: 'SubmitHunt', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/og-image.png` } };
const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

function postJsonLd(post, url, desc, startup) {
  const article = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: clip(post.title, 110),
    description: desc,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: OG_IMG,
    datePublished: post.published_at || undefined,
    dateModified: post.updated_at || post.published_at || undefined,
    author: post.author_name && post.author_name !== 'SubmitHunt'
      ? { '@type': 'Person', name: post.author_name }
      : org,
    publisher: org,
    isPartOf: { '@type': 'Blog', name: 'SubmitHunt Blog', url: BLOG_URL },
    keywords: Array.isArray(post.keywords) && post.keywords.length ? post.keywords.join(', ') : undefined,
    articleSection: post.category || undefined,
    wordCount: stripTags(post.content).split(' ').filter(Boolean).length || undefined,
    inLanguage: 'en',
  };
  if (startup?.slug) article.about = { '@type': 'SoftwareApplication', name: startup.title, url: `${SITE}/startup/${encodeURIComponent(startup.slug)}` };
  return jsonLdScripts([article, crumbs([['Home', `${SITE}/`], ['Blog', BLOG_URL], [post.title, url]])]);
}

function postBody(post, startup) {
  const meta = [fmtDate(post.published_at), post.author_name || 'SubmitHunt', post.category].filter(Boolean).map(esc).join(' · ');
  const tags = Array.isArray(post.keywords) ? post.keywords.filter(Boolean) : [];
  return `
      <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav aria-label="Breadcrumb" class="text-xs text-gray-500 mb-6"><a href="/">Home</a> › <a href="/blog">Blog</a> › <span>${esc(clip(post.title, 80))}</span></nav>
        <article class="bg-white border border-gray-200 rounded-2xl shadow-sm p-7 sm:p-10">
          <p class="text-xs text-gray-500 mb-5">${meta}</p>
          <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-5">${esc(post.title)}</h1>
          ${post.excerpt ? `<p class="text-lg text-gray-600 mb-8 leading-relaxed pl-4 border-l-2 border-orange-300">${esc(post.excerpt)}</p>` : ''}
          <div class="blog-content">${post.content || ''}</div>
          ${tags.length ? `<p class="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500">Tags: ${tags.map(esc).join(', ')}</p>` : ''}
          ${startup?.slug ? `<p class="mt-6 text-sm text-gray-700">Launched on SubmitHunt: <a href="/startup/${esc(encodeURIComponent(startup.slug))}" class="underline">${esc(startup.title)}</a>${startup.tagline ? ` — ${esc(startup.tagline)}` : ''}</p>` : ''}
        </article>
        <p class="mt-10 text-center text-sm text-gray-600">Building something? <a href="/submit" class="underline">Submit your startup</a> and get a permanent listing with a do-follow backlink.</p>
      </main>`;
}

function indexBody(posts) {
  const items = posts.map((p) => `
          <li class="py-4 border-b border-gray-100">
            <a href="/blog/${esc(encodeURIComponent(p.slug))}" class="text-lg font-semibold text-gray-900 hover:underline">${esc(p.title)}</a>
            <p class="text-xs text-gray-500 mt-1">${esc([fmtDate(p.published_at), p.category].filter(Boolean).join(' · '))}</p>
            ${p.excerpt ? `<p class="text-sm text-gray-600 mt-2">${esc(clip(p.excerpt, 200))}</p>` : ''}
          </li>`).join('');
  return `
      <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-3">SubmitHunt Blog</h1>
        <p class="text-gray-600 mb-8">Reviews of startups launched on SubmitHunt, plus launch, backlink and directory guides for makers. Latest ${posts.length} posts below; every post is listed in the <a href="/sitemap.xml" class="underline">sitemap</a>.</p>
        <ul>${items}
        </ul>
      </main>`;
}

export default async function handler(req, res) {
  const host = req.headers.host || 'www.submithunt.com';
  const slug = req.query && req.query.slug ? String(req.query.slug).trim() : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const shell = await getShell(host);

  if (!slug) {
    const posts = await loadIndex();
    const title = 'Startup Reviews & Launch Guides | SubmitHunt Blog';
    const desc = 'Reviews of startups launched on SubmitHunt and practical guides on launching, directory listings and do-follow backlinks for makers.';
    const meta = headMeta({ title, desc, url: BLOG_URL });
    const jsonld = jsonLdScripts([
      { '@context': 'https://schema.org', '@type': 'Blog', name: 'SubmitHunt Blog', url: BLOG_URL, description: desc, publisher: org,
        blogPost: posts.slice(0, 25).map((p) => ({ '@type': 'BlogPosting', headline: clip(p.title, 110), url: `${BLOG_URL}/${encodeURIComponent(p.slug)}`, datePublished: p.published_at || undefined })) },
      crumbs([['Home', `${SITE}/`], ['Blog', BLOG_URL]]),
    ]);
    const body = indexBody(posts);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).send(shell ? injectBody(injectHead(shell, meta, jsonld), body) : minimalShell(meta + jsonld, body));
  }

  const post = await loadPost(slug);
  if (!post) {
    const meta = headMeta({ title: 'Post not found | SubmitHunt Blog', desc: 'This blog post does not exist or is no longer published.', url: `${BLOG_URL}/${encodeURIComponent(slug)}`, noindex: true });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(404).send(shell ? injectHead(shell, meta, '') : minimalShell(meta));
  }

  const startup = await loadStartup(post.startup_id);
  const url = `${BLOG_URL}/${encodeURIComponent(post.slug)}`;
  const title = `${clip(post.title, 70)} | SubmitHunt Blog`;
  const desc = clip(post.meta_description || post.excerpt || stripTags(post.content), 160);
  const meta = headMeta({
    title, desc, url, type: 'article', published: post.published_at, modified: post.updated_at,
    keywords: Array.isArray(post.keywords) && post.keywords.length ? post.keywords.join(', ') : '',
  });
  const jsonld = postJsonLd(post, url, desc, startup);
  const body = postBody(post, startup);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(shell ? injectBody(injectHead(shell, meta, jsonld), body) : minimalShell(meta + jsonld, body));
}
