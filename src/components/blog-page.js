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
      .select('id, title, slug, excerpt, published_at, view_count, generated_by')
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
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

  if (loading) return html`
    <div class="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-600">Loading blog posts...</p>
      </div>
    </div>
  `;

  if (error) return html`
    <div class="min-h-screen bg-gray-50 py-12">
      <div class="max-w-4xl mx-auto px-4">
        <div class="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 class="text-red-800 font-bold mb-2">Error Loading Blog</h3>
          <p class="text-red-600">${error}</p>
        </div>
      </div>
    </div>
  `;

  return html`
    <div class="min-h-screen bg-gray-50">
      <div class="bg-blue-400 border-b-4 border-black text-black py-12">
        <div class="max-w-4xl mx-auto px-4">
          <h1 class="text-4xl md:text-5xl font-bold mb-3">SubmitHunt Blog</h1>
          <p class="text-lg font-medium">
            Insights, tips, and strategies for launching and growing your startup
          </p>
        </div>
      </div>

      <div class="max-w-6xl mx-auto px-4 py-12">
        ${posts.length === 0 ? html`
          <div class="text-center py-12">
            <p class="text-gray-600 text-lg">No blog posts yet. Check back soon!</p>
          </div>
        ` : html`
          <div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            ${posts.map(post => html`
              <article
                key=${post.id}
                class="bg-white border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
                onClick=${() => navigate(`/blog/${post.slug}`)}
              >
                <div class="p-6">
                  <div class="flex items-center gap-2 mb-3">
                    <span class="text-sm text-gray-500">${formatDate(post.published_at)}</span>
                    ${post.generated_by === 'openrouter' && html`
                      <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-300 font-bold">AI</span>
                    `}
                  </div>
                  <h2 class="text-xl font-bold text-gray-900 mb-3 line-clamp-2">${post.title}</h2>
                  <p class="text-gray-600 mb-4 line-clamp-3 text-sm">${post.excerpt}</p>
                  <div class="flex items-center justify-between">
                    <span class="text-blue-600 font-bold text-sm hover:underline">Read More →</span>
                    <span class="text-xs text-gray-400">${post.view_count || 0} views</span>
                  </div>
                </div>
              </article>
            `)}
          </div>
        `}
      </div>

      <div class="bg-yellow-300 border-t-4 border-black py-16 mt-4">
        <div class="max-w-4xl mx-auto px-4 text-center">
          <h2 class="text-3xl font-bold mb-4">Ready to Launch Your Startup?</h2>
          <p class="text-lg mb-8">Join thousands of founders who've launched on SubmitHunt</p>
          <a
            href="/submit"
            class="inline-block bg-black text-white px-8 py-3 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold text-lg hover:bg-gray-800 transition-colors"
          >
            🚀 Submit Your Startup
          </a>
        </div>
      </div>
    </div>
  `;
};
