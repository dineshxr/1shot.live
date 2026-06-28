-- Make the do-follow backlink OPTIONAL for free launches.
--
-- Previously (20260611000000) a free launch required THREE things:
--   1. Upvote 3 products
--   2. Comment on 1 product
--   3. A verified do-follow SubmitHunt backlink on the product's own site
--
-- The backlink is now OPTIONAL. A free launch is unlocked by community
-- engagement alone (upvote 3 + comment 1). Makers can still add a do-follow
-- badge to claim a DR 37+ backlink — and we keep nudging them to (submit form
-- skip toggle, dashboard, launch email) — but it no longer blocks the launch.
--
-- We only relax the `eligible` computation. sh_free_submission_status() STILL
-- reports backlink_verified so the UI can show the do-follow status and the
-- dashboard / launch-email reminders can target makers who haven't added one.
-- enforce_free_unlock() reads `eligible`, so relaxing the function relaxes the
-- gate; we re-create it only to refresh the user-facing error message (it must
-- no longer mention the backlink).
--
-- Unchanged: the backlink_verifications table, the verify-backlink Edge
-- Function, the startups.backlink_url / backlink_verified_at columns, the
-- per-domain free uniqueness rule (20260525000000) and the launch-date queue.

-- ---------------------------------------------------------------------------
-- 1) Engagement-only eligibility (backlink still reported, no longer required)
-- ---------------------------------------------------------------------------
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

  -- Backlink is now OPTIONAL: engagement alone unlocks a free launch. We still
  -- report backlink_verified so the UI can show do-follow status and the
  -- dashboard / email reminders can target makers who skipped it.
  return json_build_object(
    'upvotes_done', v_upvotes, 'upvotes_required', 3,
    'comments_done', v_comments, 'comments_required', 1,
    'backlink_verified', v_backlink,
    'is_returning', v_last_free is not null,
    'eligible', (v_upvotes >= 3 and v_comments >= 1)
  );
end;
$$;

-- Internal helper — only callable through get_free_submission_status() and the
-- trigger (grants unchanged from 20260611000000; re-asserted here to be safe).
revoke all on function public.sh_free_submission_status(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Refresh the write-time gate's error message (backlink no longer required)
-- ---------------------------------------------------------------------------
-- enforce_free_unlock() already reads `eligible` from the function above, so
-- the relaxed rule takes effect immediately. We re-create the function only to
-- update the human-facing message a blocked insert raises. The trigger itself
-- references the function by name and does not need to be re-created.
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
  -- The service role (Stripe webhook, crons) and direct SQL stay exempt.
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  if v_claims is null then
    return new;
  end if;
  v_role := coalesce(v_claims ->> 'role', '');
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;

  v_email := nullif(v_claims ->> 'email', '');

  -- Pin the stored author email to the authenticated identity (see the original
  -- migration for why — the freshness anchor would otherwise be detachable).
  if v_email is not null then
    new.author := coalesce(new.author, '{}'::jsonb) || jsonb_build_object('email', v_email);
  end if;

  v_status := public.sh_free_submission_status(v_email, new.url);
  if not coalesce((v_status ->> 'eligible')::boolean, false) then
    raise exception 'FREE_UNLOCK_REQUIRED: Upvote 3 products and comment on 1 to unlock your free launch.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- enforce_free_unlock is a TRIGGER function — it must never be RPC-callable.
revoke execute on function public.enforce_free_unlock() from public, anon, authenticated;
