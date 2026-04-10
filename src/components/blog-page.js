import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../lib/supabase.js';

export function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBlogPosts();
  }, []);

  async function loadBlogPosts() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, published_at, view_count, generated_by')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      console.error('Error loading blog posts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  if (loading) {
    return html`
      <div class="min-h-screen bg-gray-50 py-12">
        <div class="max-w-4xl mx-auto px-4">
          <div class="text-center">
            <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p class="mt-4 text-gray-600">Loading blog posts...</p>
          </div>
        </div>
      </div>
    `;
  }

  if (error) {
    return html`
      <div class="min-h-screen bg-gray-50 py-12">
        <div class="max-w-4xl mx-auto px-4">
          <div class="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 class="text-red-800 font-bold mb-2">Error Loading Blog</h3>
            <p class="text-red-600">${error}</p>
          </div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="min-h-screen bg-gray-50">
      <!-- Hero Section -->
      <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-16">
        <div class="max-w-4xl mx-auto px-4">
          <h1 class="text-4xl md:text-5xl font-bold mb-4">SubmitHunt Blog</h1>
          <p class="text-xl text-blue-100">
            Insights, tips, and strategies for launching and growing your startup
          </p>
        </div>
      </div>

      <!-- Blog Posts Grid -->
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
                class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                onClick=${() => window.navigate(`/blog/${post.slug}`)}
              >
                <div class="p-6">
                  <div class="flex items-center gap-2 mb-3">
                    <span class="text-sm text-gray-500">
                      ${formatDate(post.published_at)}
                    </span>
                    ${post.generated_by === 'openrouter' && html`
                      <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        AI-Generated
                      </span>
                    `}
                  </div>
                  
                  <h2 class="text-xl font-bold text-gray-900 mb-3 line-clamp-2">
                    ${post.title}
                  </h2>
                  
                  <p class="text-gray-600 mb-4 line-clamp-3">
                    ${post.excerpt}
                  </p>
                  
                  <div class="flex items-center justify-between">
                    <span class="text-blue-600 font-semibold hover:text-blue-700">
                      Read More →
                    </span>
                    <span class="text-sm text-gray-400">
                      ${post.view_count || 0} views
                    </span>
                  </div>
                </div>
              </article>
            `)}
          </div>
        `}
      </div>

      <!-- CTA Section -->
      <div class="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16 mt-12">
        <div class="max-w-4xl mx-auto px-4 text-center">
          <h2 class="text-3xl font-bold mb-4">Ready to Launch Your Startup?</h2>
          <p class="text-xl text-blue-100 mb-8">
            Join thousands of founders who've launched on SubmitHunt
          </p>
          <button
            onClick=${() => window.navigate('/submit')}
            class="bg-white text-blue-600 px-8 py-3 rounded-lg font-bold text-lg hover:bg-blue-50 transition-colors"
          >
            Submit Your Startup
          </button>
        </div>
      </div>
    </div>
  `;
}
