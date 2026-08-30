-- Free launches without a verified do-follow backlink wait at least 1 week.
--
-- The /submit date grid now starts at tomorrow (EST) and unlocks the
-- near-term ("this week") dates only for makers whose do-follow badge is
-- verified (backlink_verifications, keyed user+host, 7-day freshness — the
-- same signal sh_free_submission_status already reports). Makers who skip
-- the badge may only schedule launch_date >= EST today + 7 days.
--
-- This makes the DB authoritative for that rule (FREE_DELAY_REQUIRED),
-- mirroring the existing FREE_UNLOCK_REQUIRED pattern: the client check is
-- cosmetic, the trigger is the gate.
--
-- Deployed-client compatibility: every previously-shipped client generates
-- free launch dates >= today + 7 (both the old +7 grid and
-- get_next_launch_date('free')), so nothing already live can trip this
-- check. The trigger fires BEFORE INSERT only (binding unchanged from
-- 20260611000000); service-role writes (Stripe webhook, crons) stay exempt.

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

  -- No verified do-follow badge => the launch waits at least 1 week (EST
  -- calendar days, matching the queue's 8 AM EST go-live).
  if not coalesce((v_status ->> 'backlink_verified')::boolean, false)
     and new.launch_date is not null
     and new.launch_date < ((now() at time zone 'America/New_York')::date + 7) then
    raise exception 'FREE_DELAY_REQUIRED: Free launches without a verified backlink are scheduled at least 1 week out. Pick a later date or verify your badge first.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- enforce_free_unlock is a TRIGGER function — it must never be RPC-callable.
revoke execute on function public.enforce_free_unlock() from public, anon, authenticated;
