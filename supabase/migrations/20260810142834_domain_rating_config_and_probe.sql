-- Domain Rating becomes a stored, probed value instead of constants scattered
-- across the codebase (api/stats.js, send-backlink-reminder, marketing copy).
--
--   site_config['domain_rating'] = { value, measured_at, source }
--
-- Readers: the send-backlink-reminder blast (at send time) and /stats (via
-- anon REST). Writer: the update-domain-rating edge function, run weekly by
-- pg_cron (job 'update-domain-rating-weekly'), which probes Ahrefs two ways —
-- the v3 API if an AHREFS_API_KEY edge secret is ever configured, else the
-- public free endpoint. Both are dead ends as of 2026-08-10 (Ahrefs closed
-- anonymous access; the account plan has no API units), so the probe is a
-- no-op that starts working the moment either path opens. Until then the row
-- is updated by hand:
--
--   UPDATE public.site_config
--   SET value = jsonb_build_object('value', 41, 'measured_at', current_date::text, 'source', 'ahrefs-manual'),
--       updated_at = now()
--   WHERE key = 'domain_rating';
--
-- Manual steps that pair with this migration:
--   supabase functions deploy update-domain-rating send-backlink-reminder

-- Public-read config: values here are facts we publish anyway (the DR is on
-- /stats). Writes stay service-role-only — RLS has no INSERT/UPDATE/DELETE
-- policies and the privileges are revoked from client roles.
CREATE TABLE public.site_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_config is public to read"
  ON public.site_config FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.site_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_config TO anon, authenticated;

-- Seed with the last hand-verified measurement (matches api/stats.js today).
INSERT INTO public.site_config (key, value)
VALUES ('domain_rating', jsonb_build_object(
  'value', 37,
  'measured_at', '2026-07-28',
  'source', 'ahrefs-manual'
));

CREATE OR REPLACE FUNCTION public.trigger_domain_rating_update()
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/update-domain-rating',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;
  RAISE LOG 'update-domain-rating triggered, request_id: %', request_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trigger_domain_rating_update() FROM PUBLIC, anon, authenticated;

-- Mondays 06:10 UTC — clear of every existing job (:00 hourlies, 05:05, 09:15,
-- :15/:45, :20 blast).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-domain-rating-weekly') THEN
    PERFORM cron.schedule('update-domain-rating-weekly', '10 6 * * 1', 'SELECT public.trigger_domain_rating_update()');
  END IF;
END;
$do$;
