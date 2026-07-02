-- Email the startup owner when someone comments on their live listing.
--
-- Flow: AFTER INSERT on comments -> notify_comment_webhook() -> pg_net POST to
-- the notify-comment edge function (x-cron-secret auth, secret in Vault as
-- 'cron_secret'). The function skips the owner's own comments, only notifies
-- for live non-archived startups, caps at 5 owner emails per startup per hour,
-- and stamps owner_notified_at on success (also the idempotency guard).
-- Free-plan owners get a Premium upsell block in the email; paid plans don't.

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;

-- SECURITY DEFINER: comments are inserted by anon/authenticated via PostgREST,
-- and those roles can't read Vault or call net.http_post. Trigger functions
-- aren't callable through the RPC surface, and search_path is pinned empty
-- with all references schema-qualified.
CREATE OR REPLACE FUNCTION public.notify_comment_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  request_id bigint;
BEGIN
  -- Fire-and-forget webhook. Never let a notification failure abort the
  -- comment insert itself.
  BEGIN
    SELECT net.http_post(
      url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/notify-comment',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := jsonb_build_object('comment_id', NEW.id)
    ) INTO request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'notify_comment_webhook failed for comment %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS notify_comment_on_insert ON public.comments;
CREATE TRIGGER notify_comment_on_insert
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_webhook();
