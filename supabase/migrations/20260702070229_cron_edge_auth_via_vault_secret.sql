-- Fix the launch-email + daily-rankings pipelines, broken since 2026-04-18.
--
-- Root cause: pg_cron called the send-live-notifications edge function through
-- trigger_live_notifications(), which carried a hardcoded service_role JWT with
-- an invalid signature. The edge gateway rejected every call with
-- 401 UNAUTHORIZED_LEGACY_JWT, so launch emails never sent. The daily-rankings
-- cron (job 1) sent no Authorization header at all and 401'd the same way.
--
-- New auth model (per Supabase guidance for pg_net -> Edge Function calls):
-- both edge functions are deployed with verify_jwt = false and instead check an
-- x-cron-secret header in code against the CRON_SECRET edge secret. The same
-- value lives in Vault as 'cron_secret'; these SQL functions read it at call
-- time so no key material is stored in pg_proc.
--
-- Manual steps that pair with this migration (already applied to prod):
--   1. supabase secrets set CRON_SECRET=<random 32-byte hex>
--   2. select vault.create_secret('<same value>', 'cron_secret', '...');
--   3. supabase functions deploy send-live-notifications update-daily-rankings
--      (config.toml pins verify_jwt = false for both)

-- The capacity check must only run when capacity-relevant columns change.
-- As BEFORE UPDATE (all columns) it aborted ANY update to a free-plan row whose
-- launch date is already over capacity — including flipping notification_sent,
-- upvote counts, etc. (There is a separate INSERT-only trigger,
-- enforce_daily_slot_limit_trigger, doing the same capacity check.)
DROP TRIGGER IF EXISTS enforce_free_slot_capacity ON public.startups;
CREATE TRIGGER enforce_free_slot_capacity
BEFORE INSERT OR UPDATE OF plan, launch_date ON public.startups
FOR EACH ROW EXECUTE FUNCTION check_free_slot_capacity();

CREATE OR REPLACE FUNCTION public.trigger_live_notifications()
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/send-live-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO request_id;
  RAISE LOG 'send-live-notifications triggered, request_id: %', request_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trigger_daily_rankings()
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/update-daily-rankings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 60000
  ) INTO request_id;
  RAISE LOG 'update-daily-rankings triggered, request_id: %', request_id;
END;
$fn$;

-- Only pg_cron (running as the job owner) should be able to fire these; they
-- must not be callable through PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.trigger_live_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_daily_rankings() FROM PUBLIC, anon, authenticated;

-- Point the daily-rankings cron (job 1) at the authenticated trigger function
-- instead of its old inline net.http_post with no auth header.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 1) THEN
    PERFORM cron.alter_job(1, command := 'SELECT public.trigger_daily_rankings()');
  END IF;
END;
$do$;
