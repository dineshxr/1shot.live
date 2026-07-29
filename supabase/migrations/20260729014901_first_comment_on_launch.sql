-- Post the maker's first comment when their product goes live.
--
-- The submit form asks makers to "write the first comment" — the note they'd
-- normally post themselves on launch morning. We can't post it at submit time
-- (a free launch sits in the queue for days, and a paid one may be scheduled),
-- so it's parked in startups.details->>'first_comment' and this trigger posts
-- it the moment the row actually goes live. That covers every go-live path in
-- one place: the Stripe webhook inserting an already-live paid row, the day-of
-- send-live-notifications sweep, publish-paid-startup, and manual admin flips.
--
-- notify-comment already skips comments whose author email matches the listing
-- owner, so this never emails the maker about their own comment.

-- SECURITY DEFINER: all writes to public.comments are revoked from anon and
-- authenticated (add_comment() is the only user-facing path), so the trigger
-- must run as the table owner to insert. Not callable over RPC; search_path
-- pinned empty with every reference schema-qualified.
CREATE OR REPLACE FUNCTION public.post_first_comment_on_launch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_content text;
  v_email   text;
  v_name    text;
  v_avatar  text;
BEGIN
  v_content := btrim(coalesce(NEW.details ->> 'first_comment', ''));
  v_email   := nullif(btrim(coalesce(NEW.author ->> 'email', '')), '');

  -- Nothing to post, or no identity to post it as.
  IF char_length(v_content) < 5 OR v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Same ceiling add_comment() enforces for hand-written comments.
  v_content := left(v_content, 1000);

  -- Idempotency: a row can be flipped live more than once (re-publish, admin
  -- edit, the stuck-paid sweep). Only ever post this comment once.
  IF EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.startup_id = NEW.id
      AND c.content = v_content
  ) THEN
    RETURN NEW;
  END IF;

  v_name   := nullif(btrim(coalesce(NEW.author ->> 'name', '')), '');
  v_avatar := nullif(btrim(coalesce(NEW.author ->> 'avatar', '')), '');

  BEGIN
    INSERT INTO public.comments (startup_id, user_id, user_email, author_name, author_avatar, content)
    VALUES (
      NEW.id,
      NULL,
      v_email,
      coalesce(v_name, split_part(v_email, '@', 1)),
      v_avatar,
      v_content
    );
  EXCEPTION WHEN OTHERS THEN
    -- A launch must never fail because its intro comment couldn't be posted.
    RAISE LOG 'post_first_comment_on_launch failed for startup %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

-- Fires on the false -> true transition, and on an INSERT that is already live
-- (the Stripe webhook path for a same-day paid launch).
DROP TRIGGER IF EXISTS post_first_comment_on_go_live ON public.startups;
CREATE TRIGGER post_first_comment_on_go_live
AFTER UPDATE OF is_live ON public.startups
FOR EACH ROW
WHEN (NEW.is_live IS TRUE AND (OLD.is_live IS DISTINCT FROM TRUE))
EXECUTE FUNCTION public.post_first_comment_on_launch();

DROP TRIGGER IF EXISTS post_first_comment_on_live_insert ON public.startups;
CREATE TRIGGER post_first_comment_on_live_insert
AFTER INSERT ON public.startups
FOR EACH ROW
WHEN (NEW.is_live IS TRUE)
EXECUTE FUNCTION public.post_first_comment_on_launch();
