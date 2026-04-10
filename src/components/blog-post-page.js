import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../lib/supabase.js';

export function BlogPostPage({ slug }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (slug) {
      loadBlogPost();
    }
  }, [slug]);

  async function loadBlogPost() {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error) throw error;
      
      if (data) {
        setPost(data);
        await incrementViewCount(data.id);
      }
    } catch (err) {
      console.error('Error loading blog post:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function incrementViewCount(postId) {
    try {
      await supabase.rpc('increment', {
        row_id: postId,
        table_name: 'blog_posts',
        column_name: 'view_count'
      }).catch(() => {
        // Fallback if RPC doesn't exist
        supabase
          .from('blog_posts')
          .update({ view_count: (post?.view_count || 0) + 1 })
          .eq('id', postId);
      });
    } catch (err) {
      console.error('Error incrementing view count:', err);
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
            <p class="mt-4 text-gray-600">Loading post...</p>
          </div>
        </div>
      </div>
    `;
  }

  if (error || !post) {
    return html`
      <div class="min-h-screen bg-gray-50 py-12">
        <div class="max-w-4xl mx-auto px-4">
          <div class="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 class="text-red-800 font-bold mb-2">Post Not Found</h3>
            <p class="text-red-600 mb-4">${error || 'This blog post does not exist.'}</p>
            <button
              onClick=${() => window.navigate('/blog')}
              class="text-blue-600 hover:text-blue-700 font-semibold"
            >
              ← Back to Blog
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="min-h-screen bg-gray-50">
      <!-- Back Button -->
      <div class="bg-white border-b">
        <div class="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick=${() => window.navigate('/blog')}
            class="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-2"
          >
            <span>←</span> Back to Blog
          </button>
        </div>
      </div>

      <!-- Article -->
      <article class="max-w-4xl mx-auto px-4 py-12">
        <div class="bg-white rounded-lg shadow-lg p-8 md:p-12">
          <!-- Meta Info -->
          <div class="flex items-center gap-4 mb-6 text-sm text-gray-600">
            <span>${formatDate(post.published_at)}</span>
            <span>•</span>
            <span>${post.view_count || 0} views</span>
            ${post.generated_by === 'openrouter' && html`
              <span>•</span>
              <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                AI-Generated
              </span>
            `}
          </div>

          <!-- Title -->
          <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            ${post.title}
          </h1>

          <!-- Excerpt -->
          ${post.excerpt && html`
            <p class="text-xl text-gray-600 mb-8 italic border-l-4 border-blue-500 pl-4">
              ${post.excerpt}
            </p>
          `}

          <!-- Content -->
          <div 
            class="prose prose-lg max-w-none"
            dangerouslySetInnerHTML=${{ __html: post.content }}
          />

          <!-- Keywords -->
          ${post.keywords && post.keywords.length > 0 && html`
            <div class="mt-12 pt-8 border-t">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">Tags:</h3>
              <div class="flex flex-wrap gap-2">
                ${post.keywords.map(keyword => html`
                  <span 
                    key=${keyword}
                    class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                  >
                    ${keyword}
                  </span>
                `)}
              </div>
            </div>
          `}
        </div>

        <!-- CTA -->
        <div class="mt-12 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-8 text-white text-center">
          <h2 class="text-2xl font-bold mb-4">Ready to Launch Your Startup?</h2>
          <p class="text-blue-100 mb-6">
            Get discovered by thousands of founders and early adopters
          </p>
          <button
            onClick=${() => window.navigate('/submit')}
            class="bg-white text-blue-600 px-8 py-3 rounded-lg font-bold hover:bg-blue-50 transition-colors"
          >
            Submit Your Startup
          </button>
        </div>
      </article>
    </div>
  `;
}
