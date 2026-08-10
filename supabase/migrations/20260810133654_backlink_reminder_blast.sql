-- Recurring "backlink reminder" marketing blast.
--
-- Every ~3 weeks, everyone who ever submitted a project gets an email with
-- SubmitHunt's current Domain Rating (fetched live from Ahrefs by the edge
-- function) and an invitation to submit their next project for another
-- dofollow backlink. Wiring follows the established cron pattern:
-- pg_cron (hourly, job 'send-backlink-reminder-hourly')
--   -> trigger_backlink_reminder() reads Vault 'cron_secret'
--   -> pg_net POST to the send-backlink-reminder edge function (verify_jwt=false,
--      checks x-cron-secret; pinned in config.toml).
--
-- The hourly job is NOT an hourly email: get_backlink_reminder_recipients()
-- only returns addresses whose last 'backlink-reminder' send is older than the
-- requested interval (21 days, set in the edge function), 50 per run. The list
-- (~1.4k addresses today) drains over the first day of each cycle, then the
-- job no-ops until recipients come due again. Sends are logged only on
-- success, so failures stay due and retry next hour.
--
-- This is the first *marketing* (non-transactional) email in the system, so it
-- also introduces opt-out plumbing: an email_unsubscribes suppression table
-- fed by the public `unsubscribe` edge function (HMAC-signed links, RFC 8058
-- one-click support). Both new tables are service-role-only: RLS on with no
-- policies, plus explicit revokes from the client roles.
--
-- Manual steps that pair with this migration:
--   supabase functions deploy send-backlink-reminder unsubscribe

-- Suppression list. One row = this address never gets marketing email again.
-- Transactional emails (launch/comment/confirmation) intentionally ignore it.
CREATE TABLE public.email_unsubscribes (
  email text PRIMARY KEY CHECK (email = lower(email)),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_unsubscribes FROM PUBLIC, anon, authenticated;

-- Send log: idempotency (the due-filter below) + an audit of what went out.
CREATE TABLE public.marketing_email_sends (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(email)),
  campaign text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_email_sends_campaign_email_sent_at_idx
  ON public.marketing_email_sends (campaign, email, sent_at DESC);

ALTER TABLE public.marketing_email_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_email_sends FROM PUBLIC, anon, authenticated;

-- Recipient picker, called via RPC by the edge function (service role).
-- One row per distinct submitter email, personalized with their most recent
-- non-archived startup. Excludes:
--   * unsubscribed addresses,
--   * anyone sent this campaign within interval_days,
--   * anyone whose newest submission is under 7 days old — they are mid
--     launch-cycle and already getting transactional email; the blast is a
--     come-back nudge, not a pile-on.
CREATE FUNCTION public.get_backlink_reminder_recipients(batch_size integer, interval_days integer)
RETURNS TABLE (
  email text,
  name text,
  startup_title text,
  startup_slug text,
  startup_live boolean,
  startup_plan text,
  backlink_verified boolean
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  WITH latest AS (
    SELECT DISTINCT ON (lower(s.author->>'email'))
      lower(s.author->>'email') AS email,
      s.author->>'name' AS name,
      s.title AS startup_title,
      s.slug AS startup_slug,
      s.is_live AS startup_live,
      s.plan AS startup_plan,
      s.backlink_verified_at IS NOT NULL AS backlink_verified,
      s.created_at
    FROM public.startups s
    WHERE NOT s.archived
      AND s.author->>'email' LIKE '%_@_%'
    ORDER BY lower(s.author->>'email'), s.created_at DESC
  )
  SELECT l.email, l.name, l.startup_title, l.startup_slug,
         l.startup_live, l.startup_plan, l.backlink_verified
  FROM latest l
  WHERE l.created_at < now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.email_unsubscribes u WHERE u.email = l.email
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.marketing_email_sends m
      WHERE m.campaign = 'backlink-reminder'
        AND m.email = l.email
        AND m.sent_at > now() - make_interval(days => interval_days)
    )
  ORDER BY l.created_at DESC
  LIMIT batch_size;
$fn$;

-- Only the edge function (service role) may call it; it exposes the whole
-- mailing list, so it must not be reachable through anon/authenticated RPC.
REVOKE EXECUTE ON FUNCTION public.get_backlink_reminder_recipients(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_backlink_reminder_recipients(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_backlink_reminder()
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/send-backlink-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO request_id;
  RAISE LOG 'send-backlink-reminder triggered, request_id: %', request_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trigger_backlink_reminder() FROM PUBLIC, anon, authenticated;

-- :20 keeps clear of the :00 hourly jobs, the :05/:15 dailies and the :15/:45
-- stuck-paid sweep.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-backlink-reminder-hourly') THEN
    PERFORM cron.schedule('send-backlink-reminder-hourly', '20 * * * *', 'SELECT public.trigger_backlink_reminder()');
  END IF;
END;
$do$;
