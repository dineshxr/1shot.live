-- Lock down writes to blog_posts (2026-11-12 SEO housekeeping).
--
-- The policies "Blog posts are insertable by service role" and "Blog posts are
-- updatable by service role" were created FOR public — i.e. every role, anon
-- included — with `true` conditions, and anon/authenticated held INSERT/UPDATE/
-- DELETE grants. Anyone with the public anon key could rewrite, unpublish or
-- insert posts, which /blog server-renders and /sitemap.xml lists. The service
-- role bypasses RLS, so those policies never did anything for it; every
-- legitimate writer (generate-blog-post, migrations) uses the service role or
-- postgres.
--
-- The only legitimate anonymous write was the client-side view counter in
-- src/components/blog-post-page.js; it now calls increment_blog_post_view().
--
-- Idempotent: safe to re-run.

create or replace function public.increment_blog_post_view(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.blog_posts
     set view_count = coalesce(view_count, 0) + 1
   where id = p_post_id
     and is_published;
$$;

revoke all on function public.increment_blog_post_view(uuid) from public;
grant execute on function public.increment_blog_post_view(uuid) to anon, authenticated;

-- updated_at feeds the sitemap's <lastmod>, so it should mean "content changed":
-- leave it alone when the only change is the view counter.
create or replace function public.update_blog_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'view_count' - 'updated_at')
       is distinct from (to_jsonb(old) - 'view_count' - 'updated_at') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop policy if exists "Blog posts are insertable by service role" on public.blog_posts;
drop policy if exists "Blog posts are updatable by service role" on public.blog_posts;

revoke insert, update, delete, truncate on public.blog_posts from anon, authenticated;
