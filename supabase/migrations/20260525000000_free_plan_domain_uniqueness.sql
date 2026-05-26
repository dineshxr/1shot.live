-- Tighten free-plan duplicate rules.
--
-- A website already submitted on the FREE plan can no longer be submitted again
-- under free as: the same site, a subpage of it, or a subdomain (either
-- direction). Paid plans (premium/featured) are exempt — spam there is gated by
-- Stripe payment, and a founder may legitimately re-launch the same site as a
-- paid launch.

-- Normalize a URL down to its bare host: lowercase, no scheme, no leading
-- "www.", no path / query / fragment / port.
create or replace function public.sh_normalize_host(p_url text)
returns text
language plpgsql
immutable
as $$
declare
  h text;
begin
  if p_url is null then
    return null;
  end if;
  h := lower(trim(p_url));
  h := regexp_replace(h, '^[a-z][a-z0-9+.-]*://', ''); -- strip scheme
  h := regexp_replace(h, '^www\.', '');                -- strip leading www.
  h := split_part(h, '/', 1);                          -- strip path
  h := split_part(h, '?', 1);                          -- strip query
  h := split_part(h, '#', 1);                          -- strip fragment
  h := split_part(h, ':', 1);                          -- strip port
  return h;
end;
$$;

-- True when p_url's host collides with an existing free-plan, non-archived
-- startup: same host, a subpage of it (same host), or a subdomain either way.
-- Used by the client for an early, friendly warning.
create or replace function public.check_free_domain_taken(p_url text)
returns boolean
language sql
stable
as $$
  with n as (select public.sh_normalize_host(p_url) as host)
  select exists (
    select 1
    from public.startups s, n
    where s.plan = 'free'
      and coalesce(s.archived, false) = false
      and n.host is not null
      and n.host <> ''
      and (
        public.sh_normalize_host(s.url) = n.host
        or right(public.sh_normalize_host(s.url), length(n.host) + 1) = '.' || n.host
        or right(n.host, length(public.sh_normalize_host(s.url)) + 1) = '.' || public.sh_normalize_host(s.url)
      )
  );
$$;

-- Enforce the rule at write time so it cannot be bypassed by a direct client
-- insert. Raised message is prefixed so the client can show a clean message.
create or replace function public.enforce_free_domain_uniqueness()
returns trigger
language plpgsql
as $$
declare
  new_host text;
  conflict boolean;
begin
  -- Only validate when url or plan is actually being set/changed, so routine
  -- updates (e.g. a cron flipping is_live) never fail on any pre-existing
  -- duplicate rows created before this migration.
  if tg_op = 'UPDATE'
     and new.url is not distinct from old.url
     and new.plan is not distinct from old.plan then
    return new;
  end if;

  if new.plan is distinct from 'free' then
    return new;
  end if;

  new_host := public.sh_normalize_host(new.url);
  if new_host is null or new_host = '' then
    return new;
  end if;

  select exists (
    select 1
    from public.startups s
    where s.plan = 'free'
      and coalesce(s.archived, false) = false
      and s.id <> new.id
      and (
        public.sh_normalize_host(s.url) = new_host
        or right(public.sh_normalize_host(s.url), length(new_host) + 1) = '.' || new_host
        or right(new_host, length(public.sh_normalize_host(s.url)) + 1) = '.' || public.sh_normalize_host(s.url)
      )
  ) into conflict;

  if conflict then
    raise exception 'DUPLICATE_FREE_DOMAIN: This website (or one of its pages or subdomains) has already been submitted on the free plan. Choose Premium or Featured to launch it again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_domain_uniqueness on public.startups;
create trigger enforce_free_domain_uniqueness
  before insert or update on public.startups
  for each row
  execute function public.enforce_free_domain_uniqueness();

grant execute on function public.sh_normalize_host(text) to anon, authenticated, service_role;
grant execute on function public.check_free_domain_taken(text) to anon, authenticated, service_role;
