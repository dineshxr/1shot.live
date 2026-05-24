import { supabaseClient } from '../lib/supabase-client.js';

/* global html, useState, useEffect */

export const BlogPage = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const supabase = supabaseClient();
    supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, published_at, view_count, category')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); }
        else { setPosts(data || []); }
        setLoading(false);
      });
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  if (loading) return html`
    <div class="min-h-[60vh] flex items-center justify-center py-16" style="background-color: var(--sh-bg);">
      <div class="text-center text-gray-500">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900"></div>
        <p class="mt-4 text-sm">Loading blog posts…</p>
      </div>
    </div>
  `;

  if (error) return html`
    <div class="min-h-[60vh] py-16" style="background-color: var(--sh-bg);">
      <div class="max-w-2xl mx-auto px-4">
        <div class="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h3 class="text-red-800 font-semibold mb-2">Error loading blog</h3>
          <p class="text-red-600 text-sm">${error}</p>
        </div>
      </div>
    </div>
  `;

  return html`
    <div style="background-color: var(--sh-bg);">
      <!-- Hero -->
      <div class="border-b border-gray-200 bg-white">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 mb-4">
            Blog
          </span>
          <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-3">
            Insights for launching and growing
          </h1>
          <p class="text-lg text-gray-500 max-w-2xl">
            Tips, strategies, and lessons from indie founders who've shipped on SubmitHunt.
          </p>
        </div>
      </div>

      <!-- Posts grid -->
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        ${posts.length === 0 ? html`
          <div class="text-center py-16 text-gray-500">
            <p class="text-base">No blog posts yet — check back soon.</p>
          </div>
        ` : html`
          <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            ${posts.map(post => html`
              <article
                key=${post.id}
                class="sh-card overflow-hidden cursor-pointer group"
                onClick=${() => navigate(`/blog/${post.slug}`)}
              >
                <div class="p-6">
                  <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <span>${formatDate(post.published_at)}</span>
                    ${post.category && html`
                      <span class="text-gray-300">·</span>
                      <span class="inline-flex items-center px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-[11px] font-medium capitalize">
                        ${post.category}
                      </span>
                    `}
                  </div>
                  <h2 class="text-base sm:text-lg font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-orange-700 transition-colors">
                    ${post.title}
                  </h2>
                  <p class="text-sm text-gray-600 mb-4 line-clamp-3 leading-relaxed">${post.excerpt}</p>
                  <div class="flex items-center justify-between text-xs text-gray-500">
                    <span class="inline-flex items-center gap-1 font-medium text-gray-900 group-hover:text-orange-700 transition-colors">
                      Read article <i class="fas fa-arrow-right text-[10px]"></i>
                    </span>
                    <span>${post.view_count || 0} views</span>
                  </div>
                </div>
              </article>
            `)}
          </div>
        `}
      </div>

      <!-- CTA -->
      <div class="border-t border-gray-200 bg-white">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-3">Ready to launch?</h2>
          <p class="text-gray-500 mb-7">Join thousands of indie founders who've launched on SubmitHunt.</p>
          <a href="/submit" class="sh-btn-primary justify-center">
            <i class="fas fa-rocket text-xs"></i> Submit your startup
          </a>
        </div>
      </div>
    </div>
  `;
};
