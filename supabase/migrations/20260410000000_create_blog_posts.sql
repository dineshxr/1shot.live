-- Create blog_posts table for SEO blog content
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  startup_id UUID REFERENCES startups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  meta_description TEXT,
  meta_keywords TEXT,
  og_image TEXT,
  author TEXT DEFAULT 'SubmitHunt Team',
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast slug lookups and listing queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_startup_id ON blog_posts(startup_id);

-- RPC to get published blog posts for listing page
CREATE OR REPLACE FUNCTION get_blog_posts(limit_count INT DEFAULT 20, offset_count INT DEFAULT 0)
RETURNS SETOF blog_posts AS $$
  SELECT * FROM blog_posts
  WHERE status = 'published'
  ORDER BY published_at DESC
  LIMIT limit_count OFFSET offset_count;
$$ LANGUAGE sql STABLE;

-- RPC to get a single blog post by slug
CREATE OR REPLACE FUNCTION get_blog_post_by_slug(post_slug TEXT)
RETURNS SETOF blog_posts AS $$
  SELECT * FROM blog_posts
  WHERE slug = post_slug AND status = 'published'
  LIMIT 1;
$$ LANGUAGE sql STABLE;
