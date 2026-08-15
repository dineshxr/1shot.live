-- Free-plan unlock = 3 upvotes only (comment requirement dropped).
--
-- 20260611000000 required upvote 3 + comment 1 (+ backlink, made optional in
-- 20260628211047). Per product decision 2026-08-15 the comment requirement is
-- dropped too: a free launch now unlocks with 3 fresh upvotes alone.
--
-- Comments remain a community feature and comments_done is still returned as
-- the REAL count with comments_required = 0. That keeps the not-yet-redeployed
-- frontend working during rollout: it renders its checklist from these fields
-- (treating `comments_required || 1` as 1), so makers who already commented
-- stay unlocked there, while the authoritative `eligible` flag — read by both
-- the client gate and the enforce_free_unlock trigger — relaxes immediately.
--
-- Unchanged: freshness (only engagement newer than the maker's last free
-- launch counts), self-exclusion (own products don't count), the optional
-- backlink reporting, the per-domain free uniqueness rule, and the launch queue.

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
      'comments_done', 0, 'comments_required', 0,
      'backlink_verified', false,
      'is_returning', false
    );
  end if;

  select max(created_at) into v_last_free
  from public.startups
  where plan = 'free'
    and lower(author ->> 'email') = v_email;

  -- Self-exclusion: upvoting your OWN products doesn't count — the gate exists
  -- so the community gets to know you.
  select count(distinct v.startup_id) into v_upvotes
  from public.votes v
  where lower(v.user_email) = v_email
    and (v_last_free is null or v.created_at > v_last_free)
    and not exists (
      select 1 from public.startups s
      where s.id = v.startup_id and lower(s.author ->> 'email') = v_email
    );

  -- Comments no longer gate anything, but the real count is still reported so
  -- any deployed UI rendering a comment step keeps working during rollout.
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
    'comments_done', v_comments, 'comments_required', 0,
    'backlink_verified', v_backlink,
    'is_returning', v_last_free is not null,
    'eligible', (v_upvotes >= 3)
  );
end;
$$;

-- Internal helper — only callable through get_free_submission_status() and the
-- trigger (grants unchanged from 20260611000000; re-asserted here to be safe).
revoke all on function public.sh_free_submission_status(text, text) from public, anon, authenticated;

-- Refresh the write-time gate's error message (comments no longer mentioned).
-- enforce_free_unlock() reads `eligible` from the function above, so the
-- relaxed rule already applies; this only updates the human-facing message.
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

  -- Pin the stored author email to the authenticated identity (see 20260611000000
  -- for why — the freshness anchor would otherwise be detachable).
  if v_email is not null then
    new.author := coalesce(new.author, '{}'::jsonb) || jsonb_build_object('email', v_email);
  end if;

  v_status := public.sh_free_submission_status(v_email, new.url);
  if not coalesce((v_status ->> 'eligible')::boolean, false) then
    raise exception 'FREE_UNLOCK_REQUIRED: Upvote 3 products to unlock your free launch.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- enforce_free_unlock is a TRIGGER function — it must never be RPC-callable.
revoke execute on function public.enforce_free_unlock() from public, anon, authenticated;
