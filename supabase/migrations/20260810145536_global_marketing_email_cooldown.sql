-- Hard floor on marketing email frequency: no address receives ANY marketing
-- email within 15 days of the previous one, regardless of campaign.
--
-- The existing check in get_backlink_reminder_recipients was per-campaign
-- (21 days for 'backlink-reminder'), which leaves a gap: a second campaign
-- with its own key could email someone the day after the backlink reminder.
-- This adds a campaign-agnostic cooldown alongside the per-campaign window,
-- so the invariant every future campaign inherits is:
--
--   per-recipient spacing >= GREATEST(15 days global, campaign interval)
--
-- Note for future campaign authors: select recipients through this function
-- (or copy BOTH NOT EXISTS blocks); the 15-day guarantee lives here, not in
-- the edge functions. DR updates (site_config) never trigger sends — they only
-- change the number shown by whatever sends were already due.

-- The (campaign, email, sent_at) index can't serve a campaign-agnostic probe
-- once more campaigns exist; give the global check its own.
CREATE INDEX marketing_email_sends_email_sent_at_idx
  ON public.marketing_email_sends (email, sent_at DESC);

CREATE OR REPLACE FUNCTION public.get_backlink_reminder_recipients(batch_size integer, interval_days integer)
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
    -- Per-campaign cadence (21 days for this campaign, set by the caller).
    AND NOT EXISTS (
      SELECT 1 FROM public.marketing_email_sends m
      WHERE m.campaign = 'backlink-reminder'
        AND m.email = l.email
        AND m.sent_at > now() - make_interval(days => interval_days)
    )
    -- Global cooldown: no marketing email of ANY campaign within 15 days.
    AND NOT EXISTS (
      SELECT 1 FROM public.marketing_email_sends g
      WHERE g.email = l.email
        AND g.sent_at > now() - interval '15 days'
    )
  ORDER BY l.created_at DESC
  LIMIT batch_size;
$fn$;
