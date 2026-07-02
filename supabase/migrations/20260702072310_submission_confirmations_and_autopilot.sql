-- Submission confirmation emails + full autopilot for the launch pipeline.
--
-- 1. Free submissions get an immediate confirmation email (queue spot + launch
--    date + badge reminder if they skipped it + Premium upsell), sent by the
--    send-submission-confirmation edge function via an AFTER INSERT trigger.
--    Paid plans are excluded here: publish-paid-startup already emails them a
--    payment-received thank-you + summary at publish time (their only email —
--    it stamps notification_sent so the hourly sweep doesn't send a duplicate).
-- 2. The daily-blog-backfill cron (job 8) drops its hardcoded legacy JWT and
--    uses the Vault cron_secret pattern like every other cron.
-- 3. publish-stuck-paid-startups is now scheduled (was manual-only): every 30
--    minutes it publishes any paid-but-not-live rows (webhook failure net) and
--    leaves notification_sent=false so the hourly sweep sends the launch email.
--
-- All referenced edge functions verify an x-cron-secret header against the
-- CRON_SECRET edge secret (same value stored in Vault as 'cron_secret').

ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;

-- SECURITY DEFINER: submissions are inserted by anon/authenticated via
-- PostgREST, which can't read Vault or call net.http_post. Trigger functions
-- aren't callable through the RPC surface; search_path pinned empty.
CREATE OR REPLACE FUNCTION public.notify_submission_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  -- Fire-and-forget confirmation email webhook. Never block the submission
  -- insert on notification plumbing.
  BEGIN
    SELECT net.http_post(
      url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/send-submission-confirmation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := jsonb_build_object('startup_id', NEW.id)
    ) INTO request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'notify_submission_webhook failed for startup %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS notify_submission_on_insert ON public.startups;
CREATE TRIGGER notify_submission_on_insert
AFTER INSERT ON public.startups
FOR EACH ROW
WHEN (NEW.plan IS NULL OR NEW.plan NOT IN ('premium', 'featured', 'pro', 'lite'))
EXECUTE FUNCTION public.notify_submission_webhook();

CREATE OR REPLACE FUNCTION public.trigger_blog_backfill()
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/backfill-blog-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;
  RAISE LOG 'backfill-blog-posts triggered, request_id: %', request_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trigger_publish_stuck_paid()
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/publish-stuck-paid-startups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;
  RAISE LOG 'publish-stuck-paid-startups triggered, request_id: %', request_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trigger_blog_backfill() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_publish_stuck_paid() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 8) THEN
    PERFORM cron.alter_job(8, command := 'SELECT public.trigger_blog_backfill()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-stuck-paid-startups') THEN
    PERFORM cron.schedule('publish-stuck-paid-startups', '15,45 * * * *', 'SELECT public.trigger_publish_stuck_paid()');
  END IF;
END;
$do$;
