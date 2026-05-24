import { supabaseClient } from '../lib/supabase-client.js';

/* global html, useState, useEffect, useRef */

export const BlogPostPage = () => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const fetchPost = (slug, isRetry = false) => {
    const supabase = supabaseClient();
    supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setLoading(false);
          setGenerating(false);
        } else if (!data) {
          if (!isRetry) {
            setGenerating(true);
            setLoading(false);
          }
          pollRef.current = setTimeout(() => fetchPost(slug, true), 5000);
        } else {
          clearTimeout(pollRef.current);
          setPost(data);
          setGenerating(false);
          setLoading(false);
          supabase.from('blog_posts')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', data.id)
            .then(() => {});
        }
      });
  };

  useEffect(() => {
    const pathParts = window.location.pathname.split('/');
    const slug = pathParts[pathParts.length - 1];
    if (!slug) { setError('Post not found'); setLoading(false); return; }
    fetchPost(slug);
    return () => clearTimeout(pollRef.current);
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const goBack = () => {
    window.history.pushState({}, '', '/blog');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const BackBar = () => html`
    <div class="border-b border-gray-200 bg-white">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <button onClick=${goBack} class="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <i class="fas fa-arrow-left text-xs"></i> Back to blog
        </button>
      </div>
    </div>
  `;

  if (loading) return html`
    <div class="min-h-[60vh] flex items-center justify-center py-16" style="background-color: var(--sh-bg);">
      <div class="text-center text-gray-500">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900"></div>
        <p class="mt-4 text-sm">Loading post…</p>
      </div>
    </div>
  `;

  if (generating) return html`
    <div style="background-color: var(--sh-bg);">
      <${BackBar} />
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 md:p-12">
          <div class="flex items-center gap-3 mb-8">
            <div class="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-900"></div>
            <span class="text-sm text-gray-500 font-medium">Generating your blog post…</span>
          </div>
          <div class="h-8 bg-gray-100 rounded-lg animate-pulse mb-3 w-3/4"></div>
          <div class="h-5 bg-gray-100 rounded-lg animate-pulse mb-10 w-1/2"></div>
          <div class="space-y-3">
            <div class="h-3 bg-gray-100 rounded animate-pulse"></div>
            <div class="h-3 bg-gray-100 rounded animate-pulse w-5/6"></div>
            <div class="h-3 bg-gray-100 rounded animate-pulse w-4/6"></div>
          </div>
          <div class="mt-8 space-y-3">
            <div class="h-3 bg-gray-100 rounded animate-pulse"></div>
            <div class="h-3 bg-gray-100 rounded animate-pulse w-5/6"></div>
            <div class="h-3 bg-gray-100 rounded animate-pulse w-3/6"></div>
          </div>
          <p class="mt-10 text-xs text-gray-400 text-center">This usually takes less than 30 seconds. The page will update automatically.</p>
        </div>
      </div>
    </div>
  `;

  if (error) return html`
    <div style="background-color: var(--sh-bg);" class="min-h-[60vh] py-16">
      <div class="max-w-2xl mx-auto px-4">
        <div class="bg-white border border-red-200 rounded-2xl shadow-sm p-6">
          <h3 class="font-semibold text-gray-900 mb-2">Post not found</h3>
          <p class="text-sm text-red-600 mb-4">${error}</p>
          <button onClick=${goBack} class="sh-btn-ghost text-sm">
            <i class="fas fa-arrow-left text-xs"></i> Back to blog
          </button>
        </div>
      </div>
    </div>
  `;

  return html`
    <div style="background-color: var(--sh-bg);">
      <${BackBar} />

      <article class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-7 sm:p-10 md:p-12">
          <div class="flex items-center gap-2 mb-5 text-xs text-gray-500">
            <span>${formatDate(post.published_at)}</span>
            <span class="text-gray-300">·</span>
            <span>${post.view_count || 0} views</span>
            ${post.category && html`
              <span class="text-gray-300">·</span>
              <span class="inline-flex items-center px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-[11px] font-medium capitalize">
                ${post.category}
              </span>
            `}
          </div>

          <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-5">${post.title}</h1>

          ${post.excerpt && html`
            <p class="text-lg text-gray-600 mb-8 leading-relaxed pl-4 border-l-2 border-orange-300">${post.excerpt}</p>
          `}

          <div
            class="blog-content"
            dangerouslySetInnerHTML=${{ __html: post.content }}
          />

          ${post.keywords && post.keywords.length > 0 && html`
            <div class="mt-10 pt-6 border-t border-gray-200">
              <h3 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Tags</h3>
              <div class="flex flex-wrap gap-2">
                ${post.keywords.map(keyword => html`
                  <span key=${keyword} class="bg-gray-50 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium">${keyword}</span>
                `)}
              </div>
            </div>
          `}
        </div>

        <div class="mt-10 bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center">
          <h2 class="text-2xl font-semibold tracking-tight text-gray-900 mb-2">Ready to launch?</h2>
          <p class="text-gray-500 mb-6">Get discovered by thousands of founders and early adopters.</p>
          <a href="/submit" class="sh-btn-primary justify-center">
            <i class="fas fa-rocket text-xs"></i> Submit your startup
          </a>
        </div>
      </article>
    </div>
  `;
};
