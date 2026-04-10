import { h, render } from "https://unpkg.com/preact@10.13.1/dist/preact.module.js";
import { useState, useEffect } from "https://unpkg.com/preact@10.13.1/hooks/dist/hooks.module.js";
import htm from "https://unpkg.com/htm@3.1.1/dist/htm.module.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm";
import { config } from "./config.js";

const html = htm.bind(h);

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

const BlogApp = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentSlug, setCurrentSlug] = useState(null);
  const [currentPost, setCurrentPost] = useState(null);
  const [postLoading, setPostLoading] = useState(false);

  // Determine if we're on a blog post detail page
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/blog/") && path.length > 6) {
      const slug = decodeURIComponent(path.split("/blog/")[1]).replace(/\/$/, "");
      if (slug) {
        setCurrentSlug(slug);
      }
    }

    const handleRouteChange = () => {
      const newPath = window.location.pathname;
      if (newPath.startsWith("/blog/") && newPath.length > 6) {
        const slug = decodeURIComponent(newPath.split("/blog/")[1]).replace(/\/$/, "");
        setCurrentSlug(slug);
      } else {
        setCurrentSlug(null);
        setCurrentPost(null);
      }
    };

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  // Fetch blog listing
  useEffect(() => {
    if (currentSlug) return;

    const fetchPosts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("blog_posts")
          .select("id, title, slug, excerpt, og_image, author, published_at, meta_keywords")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(50);

        if (!error && data) {
          setPosts(data);
        }
      } catch (err) {
        console.error("Error fetching blog posts:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, [currentSlug]);

  // Fetch single blog post
  useEffect(() => {
    if (!currentSlug) return;

    const fetchPost = async () => {
      setPostLoading(true);
      try {
        const { data, error } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("slug", currentSlug)
          .eq("status", "published")
          .limit(1)
          .single();

        if (!error && data) {
          setCurrentPost(data);
          // Update page meta dynamically
          document.title = `${data.title} | SubmitHunt Blog`;
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) metaDesc.setAttribute("content", data.meta_description || data.excerpt || "");
          const ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle) ogTitle.setAttribute("content", data.title);
          const ogDesc = document.querySelector('meta[property="og:description"]');
          if (ogDesc) ogDesc.setAttribute("content", data.meta_description || data.excerpt || "");
          if (data.og_image) {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) ogImage.setAttribute("content", data.og_image);
          }
          const canonical = document.querySelector('link[rel="canonical"]');
          if (canonical) canonical.setAttribute("href", `https://submithunt.com/blog/${data.slug}`);
        } else {
          setCurrentPost(null);
        }
      } catch (err) {
        console.error("Error fetching blog post:", err);
      } finally {
        setPostLoading(false);
      }
    };
    fetchPost();
  }, [currentSlug]);

  const navigateToPost = (slug, e) => {
    e.preventDefault();
    window.history.pushState({}, "", `/blog/${slug}`);
    setCurrentSlug(slug);
    window.scrollTo(0, 0);
  };

  const navigateToList = (e) => {
    e.preventDefault();
    window.history.pushState({}, "", "/blog");
    setCurrentSlug(null);
    setCurrentPost(null);
    document.title = "Blog | SubmitHunt - Startup Launches, Tips & Industry Insights";
    window.scrollTo(0, 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Header
  const BlogHeader = () => html`
    <header class="bg-blue-400 text-black border-b-4 border-black">
      <div class="container max-w-6xl mx-auto px-4 py-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <a href="/" class="flex items-center mr-6">
              <img src="/src/sh-logo.png" alt="SubmitHunt Logo" class="w-10 h-10 mr-2" />
              <span class="text-2xl font-bold">Submit Hunt</span>
            </a>
            <span class="text-lg font-bold bg-yellow-300 px-3 py-1 rounded border-2 border-black">Blog</span>
          </div>
          <nav class="flex items-center gap-4">
            <a href="/" class="font-bold hover:underline">Home</a>
            <a href="/submit" class="font-bold hover:underline">Submit</a>
            <a href="/pricing" class="font-bold hover:underline">Pricing</a>
          </nav>
        </div>
      </div>
    </header>
  `;

  // Footer
  const BlogFooter = () => html`
    <footer class="bg-green-400 text-black py-8 border-t-4 border-black">
      <div class="container max-w-6xl mx-auto px-4">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <div class="mb-4 md:mb-0">
            <h2 class="text-xl font-bold">Submit Hunt</h2>
            <p class="text-black mt-1 font-medium">A directory for Startups and AI projects</p>
          </div>
          <div class="flex space-x-6">
            <a href="/" class="font-bold hover:underline">Home</a>
            <a href="/blog" class="font-bold hover:underline">Blog</a>
            <a href="/submit" class="font-bold hover:underline">Submit</a>
            <a href="https://x.com/submithunt" target="_blank" class="text-black hover:text-blue-800 transition-colors">
              <i class="fab fa-twitter text-xl"></i>
            </a>
          </div>
        </div>
        <div class="mt-6 text-center text-black font-medium border-t-2 border-black pt-4">
          <div class="flex items-center justify-center">
            <img src="/src/sh-logo.png" alt="SubmitHunt Logo" class="w-6 h-6 mr-2" />
            ${new Date().getFullYear()} · Submit Hunt · All rights reserved
          </div>
        </div>
      </div>
    </footer>
  `;

  // Blog post detail view
  if (currentSlug) {
    if (postLoading) {
      return html`
        <${BlogHeader} />
        <main class="max-w-4xl mx-auto px-4 py-12">
          <div class="text-center">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            <p class="mt-4 text-gray-600">Loading article...</p>
          </div>
        </main>
        <${BlogFooter} />
      `;
    }

    if (!currentPost) {
      return html`
        <${BlogHeader} />
        <main class="max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 class="text-3xl font-bold mb-4">Post Not Found</h1>
          <p class="text-gray-600 mb-6">The blog post you're looking for doesn't exist.</p>
          <a href="/blog" onClick=${navigateToList} class="text-blue-600 hover:underline font-bold">Back to Blog</a>
        </main>
        <${BlogFooter} />
      `;
    }

    return html`
      <${BlogHeader} />
      <main class="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <nav class="mb-6">
          <a href="/blog" onClick=${navigateToList} class="text-blue-600 hover:underline font-medium">
            <i class="fas fa-arrow-left mr-2"></i>Back to Blog
          </a>
        </nav>

        <article class="bg-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 md:p-10" itemscope itemtype="https://schema.org/BlogPosting">
          <header class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-black mb-4" itemprop="headline">${currentPost.title}</h1>
            <div class="flex items-center text-gray-600 text-sm gap-4">
              <span itemprop="author">${currentPost.author || "SubmitHunt Team"}</span>
              <span>·</span>
              <time datetime=${currentPost.published_at} itemprop="datePublished">
                ${formatDate(currentPost.published_at)}
              </time>
            </div>
          </header>

          ${currentPost.og_image && html`
            <div class="mb-8">
              <img
                src=${currentPost.og_image}
                alt=${currentPost.title}
                class="w-full rounded-lg border border-gray-200"
                itemprop="image"
              />
            </div>
          `}

          <div
            class="prose prose-lg max-w-none blog-content"
            itemprop="articleBody"
            dangerouslySetInnerHTML=${{ __html: currentPost.content }}
          ></div>
        </article>

        <!-- CTA Section -->
        <div class="mt-8 bg-yellow-100 border-2 border-black rounded-lg p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 class="text-2xl font-bold mb-2">Launch Your Startup on SubmitHunt</h2>
          <p class="text-gray-700 mb-4">Get featured, receive a 37+ DR backlink, and reach thousands of daily visitors.</p>
          <a href="/submit" class="inline-block px-6 py-3 bg-blue-400 border-2 border-black rounded font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 transition-colors">
            Submit Your Startup
          </a>
        </div>
      </main>
      <${BlogFooter} />
    `;
  }

  // Blog listing view
  return html`
    <${BlogHeader} />
    <main class="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div class="text-center mb-10">
        <h1 class="text-4xl font-bold text-black mb-3">SubmitHunt Blog</h1>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover the latest startup launches, founder stories, and insights from the indie hacker community.
        </p>
      </div>

      ${loading ? html`
        <div class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          <p class="mt-4 text-gray-600">Loading posts...</p>
        </div>
      ` : posts.length === 0 ? html`
        <div class="text-center py-12">
          <p class="text-gray-500 text-lg">No blog posts yet. Check back soon!</p>
        </div>
      ` : html`
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${posts.map(post => html`
            <a
              href=${`/blog/${post.slug}`}
              onClick=${(e) => navigateToPost(post.slug, e)}
              class="block bg-white border-2 border-black rounded-lg overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              ${post.og_image ? html`
                <div class="h-48 overflow-hidden border-b-2 border-black">
                  <img
                    src=${post.og_image}
                    alt=${post.title}
                    class="w-full h-full object-cover"
                    onError=${(e) => { e.target.style.display = "none"; }}
                  />
                </div>
              ` : html`
                <div class="h-48 bg-gradient-to-br from-blue-400 to-green-400 border-b-2 border-black flex items-center justify-center">
                  <i class="fas fa-rocket text-4xl text-white"></i>
                </div>
              `}
              <div class="p-5">
                <h2 class="text-lg font-bold text-black mb-2 line-clamp-2">${post.title}</h2>
                <p class="text-gray-600 text-sm mb-3 line-clamp-3">${post.excerpt}</p>
                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>${post.author || "SubmitHunt Team"}</span>
                  <time datetime=${post.published_at}>${formatDate(post.published_at)}</time>
                </div>
              </div>
            </a>
          `)}
        </div>
      `}

      <!-- CTA Section -->
      <div class="mt-12 bg-yellow-100 border-2 border-black rounded-lg p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h2 class="text-2xl font-bold mb-2">Want Your Startup Featured Here?</h2>
        <p class="text-gray-700 mb-4">Submit your startup to SubmitHunt and get an auto-generated blog post, a 37+ DR backlink, and exposure to thousands of visitors.</p>
        <a href="/submit" class="inline-block px-6 py-3 bg-blue-400 border-2 border-black rounded font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 transition-colors">
          Submit Your Startup
        </a>
      </div>
    </main>
    <${BlogFooter} />
  `;
};

render(html`<${BlogApp} />`, document.getElementById("blog-root"));
