import { supabaseClient } from '../lib/supabase-client.js';

/* global html, useState, useEffect */

export const BlogPostPage = () => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Read slug from URL path: /blog/:slug
    const pathParts = window.location.pathname.split('/');
    const slug = pathParts[pathParts.length - 1];
    if (!slug) { setError('Post not found'); setLoading(false); return; }

    const supabase = supabaseClient();
    supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); }
        else if (!data) { setError('Post not found'); }
        else {
          setPost(data);
          // Silently increment view count
          supabase.from('blog_posts')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', data.id)
            .then(() => {});
        }
        setLoading(false);
      });
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

  if (loading) return html`
    <div class="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-600">Loading post...</p>
      </div>
    </div>
  `;

  if (error || !post) return html`
    <div class="min-h-screen bg-gray-50 py-12">
      <div class="max-w-4xl mx-auto px-4">
        <div class="bg-red-50 border-2 border-black rounded p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h3 class="font-bold mb-2 text-lg">Post Not Found</h3>
          <p class="text-red-600 mb-4">${error || 'This blog post does not exist.'}</p>
          <button onClick=${goBack} class="text-blue-600 font-bold hover:underline">← Back to Blog</button>
        </div>
      </div>
    </div>
  `;

  return html`
    <div class="min-h-screen bg-gray-50">
      <div class="bg-white border-b-2 border-black">
        <div class="max-w-4xl mx-auto px-4 py-4">
          <button onClick=${goBack} class="text-blue-600 font-bold flex items-center gap-1 hover:underline">
            ← Back to Blog
          </button>
        </div>
      </div>

      <article class="max-w-4xl mx-auto px-4 py-12">
        <div class="bg-white border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-8 md:p-12">
          <div class="flex items-center gap-3 mb-6 text-sm text-gray-500">
            <span>${formatDate(post.published_at)}</span>
            <span>•</span>
            <span>${post.view_count || 0} views</span>
            ${post.generated_by === 'openrouter' && html`
              <span>•</span>
              <span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-300 font-bold text-xs">AI-Generated</span>
            `}
          </div>

          <h1 class="text-3xl md:text-4xl font-bold text-gray-900 mb-6">${post.title}</h1>

          ${post.excerpt && html`
            <p class="text-lg text-gray-600 mb-8 italic border-l-4 border-blue-400 pl-4">${post.excerpt}</p>
          `}

          <div
            class="prose prose-lg max-w-none"
            dangerouslySetInnerHTML=${{ __html: post.content }}
          />

          ${post.keywords && post.keywords.length > 0 && html`
            <div class="mt-10 pt-6 border-t-2 border-black">
              <h3 class="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Tags:</h3>
              <div class="flex flex-wrap gap-2">
                ${post.keywords.map(keyword => html`
                  <span key=${keyword} class="bg-gray-100 border border-black text-gray-700 px-3 py-1 rounded text-sm font-medium">${keyword}</span>
                `)}
              </div>
            </div>
          `}
        </div>

        <div class="mt-10 bg-yellow-300 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-8 text-center">
          <h2 class="text-2xl font-bold mb-3">Ready to Launch Your Startup?</h2>
          <p class="mb-6">Get discovered by thousands of founders and early adopters</p>
          <a
            href="/submit"
            class="inline-block bg-black text-white px-8 py-3 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold hover:bg-gray-800 transition-colors"
          >
            🚀 Submit Your Startup
          </a>
        </div>
      </article>
    </div>
  `;
};
