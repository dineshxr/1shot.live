-- Free-plan unlock = community engagement + a do-follow backlink.
--
-- A free launch must be "earned" by completing THREE requirements, all checked
-- server-side so the gate can't be bypassed by a direct client insert:
--   1. Upvote 3 products
--   2. Comment on 1 product
--   3. Embed a do-follow SubmitHunt badge/link on the product's own site and
--      verify it (the verify-backlink Edge Function fetches the page, confirms a
--      do-follow <a> to submithunt.com, and records a backlink_verifications row).
--
-- For returning makers the upvote/comment engagement must be FRESH — newer than
-- their most recent free submission — so each free launch requires supporting
-- the community again. The backlink is matched per product host.
--
-- The existing launch-date queue (7-days-out picker, 6 free slots/day) and the
-- per-domain free uniqueness rule (20260525000000) are unchanged. This replaces
-- only the old "one active free startup per email" hard block, so a maker can
-- launch additional free products once each one clears the gate.
--
-- Paid plans (premium/featured) are exempt — spam there is gated by Stripe
-- payment, and the stripe-webhook Edge Function inserts with the service role.
--
-- COMMENTS are also a new community feature for the product detail page (no
-- comments table existed before) and double as requirement #2 above.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Harden sh_normalize_host (forward revision of 20260525000000)
-- ---------------------------------------------------------------------------
-- Strip a userinfo segment ("user:pass@") so a link like
-- https://submithunt.com:8080@evil.com (which a browser resolves to evil.com)
-- normalizes to evil.com, not submithunt.com — otherwise it could spoof both the
-- backlink check here AND the duplicate-domain gate. Path/query/fragment are
-- removed BEFORE userinfo so an "@" in a path is never mistaken for userinfo,
-- and userinfo uses a greedy match (browsers treat the LAST "@" as the
-- delimiter). The TS normalizeHost() in verify-backlink/index.ts mirrors this.
create or replace function public.sh_normalize_host(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  h text;
begin
  if p_url is null then
    return null;
  end if;
  h := lower(trim(p_url));
  h := regexp_replace(h, '^[a-z][a-z0-9+.-]*://', ''); -- strip scheme
  h := regexp_replace(h, '^//', '');                   -- protocol-relative //host
  h := split_part(h, '/', 1);                          -- strip path (before userinfo)
  h := split_part(h, '?', 1);                          -- strip query
  h := split_part(h, '#', 1);                          -- strip fragment
  h := regexp_replace(h, '^.*@', '');                  -- strip userinfo (greedy → last @)
  h := regexp_replace(h, '^www\.', '');                -- strip leading www.
  h := split_part(h, ':', 1);                          -- strip port
  return h;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Comments
-- ---------------------------------------------------------------------------

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  user_id uuid,
  user_email text not null,
  author_name text,
  author_avatar text,
  content text not null,
  created_at timestamptz not null default now(),
  -- Backstop only; the friendly 5-1000 char rule lives in add_comment().
  constraint comments_content_length check (char_length(btrim(content)) between 2 and 2000)
);

create index if not exists idx_comments_startup_created
  on public.comments (startup_id, created_at desc);

create index if not exists idx_comments_email_created
  on public.comments (lower(user_email), created_at desc);

alter table public.comments enable row level security;

drop policy if exists comments_select_all on public.comments;
create policy comments_select_all on public.comments
  for select using (true);

-- All writes go through add_comment() (security definer) or the service role.
revoke insert, update, delete on public.comments from anon, authenticated;

-- RLS is row-level, so a "using (true)" select policy would otherwise let any
-- visitor read EVERY commenter's email. Restrict direct table reads to the
-- non-PII columns (the client only ever selects these); user_email / user_id
-- stay private. add_comment() is security definer, so it still returns the
-- author their own full row.
revoke select on public.comments from anon, authenticated;
grant select (id, startup_id, author_name, author_avatar, content, created_at)
  on public.comments to anon, authenticated;

-- Post a comment as the signed-in user. Mirrors upvote_startup's contract:
-- returns {error: text} on failure, {comment: row} on success, so the client
-- can show friendly messages without parsing exceptions.
create or replace function public.add_comment(startup_id_param uuid, content_param text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_content text;
  v_daily integer;
  v_comment public.comments;
begin
  v_email := nullif(auth.jwt() ->> 'email', '');
  if v_email is null then
    return json_build_object('error', 'Please sign in to comment.');
  end if;

  v_content := btrim(coalesce(content_param, ''));
  if char_length(v_content) < 5 then
    return json_build_object('error', 'Comments need at least 5 characters.');
  end if;
  if char_length(v_content) > 1000 then
    return json_build_object('error', 'Comments are limited to 1000 characters.');
  end if;

  if not exists (select 1 from public.startups s where s.id = startup_id_param) then
    return json_build_object('error', 'Startup not found.');
  end if;

  select count(*) into v_daily
  from public.comments
  where lower(user_email) = lower(v_email)
    and created_at > now() - interval '24 hours';
  if v_daily >= 20 then
    return json_build_object('error', 'Daily comment limit reached. Try again tomorrow.');
  end if;

  insert into public.comments (startup_id, user_id, user_email, author_name, author_avatar, content)
  values (
    startup_id_param,
    auth.uid(),
    v_email,
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'full_name',
      auth.jwt() -> 'user_metadata' ->> 'name',
      split_part(v_email, '@', 1)
    ),
    auth.jwt() -> 'user_metadata' ->> 'avatar_url',
    v_content
  )
  returning * into v_comment;

  return json_build_object('comment', row_to_json(v_comment));
end;
$$;

revoke all on function public.add_comment(uuid, text) from public, anon;
grant execute on function public.add_comment(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Backlink verifications (written by the verify-backlink Edge Function)
-- ---------------------------------------------------------------------------

create table if not exists public.backlink_verifications (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  -- normalized product host (matches public.sh_normalize_host(startups.url))
  product_host text not null,
  link_url text not null,
  dofollow boolean not null default true,
  verified_at timestamptz not null default now()
);

create index if not exists idx_backlink_verifications_lookup
  on public.backlink_verifications (lower(user_email), product_host, verified_at desc);

-- Private table: only the service role (Edge Function) writes it, and only
-- security-definer functions / the trigger read it. No PostgREST access.
alter table public.backlink_verifications enable row level security;
revoke all on public.backlink_verifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Combined free-plan unlock status (shared by the client RPC and the trigger)
-- ---------------------------------------------------------------------------

-- Required counts. Inlined as literals in the function so they can't drift.
--   upvotes_required = 3, comments_required = 1, backlink within 7 days.

-- Engagement counts as DISTINCT products (upvote_startup is a per-user toggle,
-- so a vote row == one product) so the requirement can't be gamed by spamming
-- the same product. Backlink valid if a fresh verification exists for the
-- product host. Returns the full status object so the UI can render progress.
create or replace function public.sh_free_submission_status(p_email text, p_product_url text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(p_email, ''));
  v_host text := public.sh_normalize_host(p_product_url);
  v_last_free timestamptz;
  v_upvotes integer := 0;
  v_comments integer := 0;
  v_backlink boolean := false;
begin
  if v_email = '' then
    return json_build_object(
      'eligible', false,
      'upvotes_done', 0, 'upvotes_required', 3,
      'comments_done', 0, 'comments_required', 1,
      'backlink_verified', false,
      'is_returning', false
    );
  end if;

  select max(created_at) into v_last_free
  from public.startups
  where plan = 'free'
    and lower(author ->> 'email') = v_email;

  -- Self-exclusion: upvoting/commenting on your OWN products doesn't count —
  -- the gate exists so the community gets to know you.
  select count(distinct v.startup_id) into v_upvotes
  from public.votes v
  where lower(v.user_email) = v_email
    and (v_last_free is null or v.created_at > v_last_free)
    and not exists (
      select 1 from public.startups s
      where s.id = v.startup_id and lower(s.author ->> 'email') = v_email
    );

  select count(distinct c.startup_id) into v_comments
  from public.comments c
  where lower(c.user_email) = v_email
    and (v_last_free is null or c.created_at > v_last_free)
    and not exists (
      select 1 from public.startups s
      where s.id = c.startup_id and lower(s.author ->> 'email') = v_email
    );

  if v_host is not null and v_host <> '' then
    select exists (
      select 1 from public.backlink_verifications b
      where lower(b.user_email) = v_email
        and b.product_host = v_host
        and b.dofollow is true
        and b.verified_at > now() - interval '7 days'
    ) into v_backlink;
  end if;

  return json_build_object(
    'upvotes_done', v_upvotes, 'upvotes_required', 3,
    'comments_done', v_comments, 'comments_required', 1,
    'backlink_verified', v_backlink,
    'is_returning', v_last_free is not null,
    'eligible', (v_upvotes >= 3 and v_comments >= 1 and v_backlink)
  );
end;
$$;

-- Internal helper — only callable through get_free_submission_status() and the
-- trigger, so one user can't probe another email's status.
revoke all on function public.sh_free_submission_status(text, text) from public, anon, authenticated;

-- Client-facing status for the signed-in user + the product URL they're about
-- to submit. Email comes from the JWT, not a parameter.
create or replace function public.get_free_submission_status(p_product_url text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select public.sh_free_submission_status(auth.jwt() ->> 'email', p_product_url);
$$;

revoke all on function public.get_free_submission_status(text) from public;
grant execute on function public.get_free_submission_status(text) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 4) Enforce at write time (the browser inserts into startups directly, so a
--    client-side check alone is bypassable)
-- ---------------------------------------------------------------------------

alter table public.startups add column if not exists backlink_url text;
alter table public.startups add column if not exists backlink_verified_at timestamptz;

create or replace function public.enforce_free_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims json;
  v_role text;
  v_email text;
  v_status json;
begin
  if new.plan is distinct from 'free' then
    return new;
  end if;

  -- Only gate requests arriving through the public API (anon/authenticated).
  -- The service role (Stripe webhook, crons) and direct SQL (dashboard,
  -- migrations) have no such claims and stay exempt.
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  if v_claims is null then
    return new;
  end if;
  v_role := coalesce(v_claims ->> 'role', '');
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;

  v_email := nullif(v_claims ->> 'email', '');

  -- Pin the stored author email to the authenticated identity. The freshness
  -- anchor (sh_free_submission_status keys "last free launch" on
  -- author->>'email') would otherwise be detachable by a hand-crafted insert
  -- that sets a different author.email, letting a returning user re-spend the
  -- same upvotes/comments. The submit page doesn't collect a contact email, so
  -- this is a no-op for the normal UI path and a guard against direct inserts.
  if v_email is not null then
    new.author := coalesce(new.author, '{}'::jsonb) || jsonb_build_object('email', v_email);
  end if;

  -- Gate on the SIGNED-IN user's email (from the JWT) and the host of the
  -- product being submitted — exactly what get_free_submission_status() shows
  -- the user, so the UI and the enforcement can never disagree.
  v_status := public.sh_free_submission_status(v_email, new.url);
  if not coalesce((v_status ->> 'eligible')::boolean, false) then
    raise exception 'FREE_UNLOCK_REQUIRED: Upvote 3 products, comment on 1, and add a verified do-follow SubmitHunt backlink to unlock your free launch.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- INSERT only: routine UPDATEs (crons flipping is_live, ranking writes) must
-- never trip the gate — same reasoning as enforce_free_domain_uniqueness.
drop trigger if exists enforce_free_unlock on public.startups;
create trigger enforce_free_unlock
  before insert on public.startups
  for each row
  execute function public.enforce_free_unlock();

-- enforce_free_unlock is a TRIGGER function — it must never be RPC-callable.
-- Revoking EXECUTE does NOT stop the trigger from firing (triggers ignore the
-- EXECUTE acl); it only removes the /rest/v1/rpc/enforce_free_unlock surface.
revoke execute on function public.enforce_free_unlock() from public, anon, authenticated;

-- Clean up any earlier single-purpose gate experiments if they were applied.
drop trigger if exists enforce_free_engagement_unlock on public.startups;
drop function if exists public.enforce_free_engagement_unlock();
drop trigger if exists enforce_free_backlink_unlock on public.startups;
drop function if exists public.enforce_free_backlink_unlock();
drop function if exists public.get_free_submission_eligibility();
drop function if exists public.check_backlink_verified(text);
drop function if exists public.sh_engagement_status(text);

-- ---------------------------------------------------------------------------
-- 5) Allow returning users back in (the unlock gate replaces the hard
--    one-active-free-startup-per-email block)
-- ---------------------------------------------------------------------------

drop index if exists public.idx_startups_unique_email_active_free;
