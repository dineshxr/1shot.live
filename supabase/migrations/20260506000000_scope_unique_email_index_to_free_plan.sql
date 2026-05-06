-- Scope the per-email uniqueness constraint to free-plan startups only.
-- The previous index blocked any returning user from submitting a paid (premium/featured)
-- launch as long as their original free startup was still non-archived.
-- Free plan keeps the "one active free startup per email" rule (the front-end already
-- hides the Free tile for returning users). Paid plans have no email-level limit; spam
-- is gated by Stripe payment.

DROP INDEX IF EXISTS public.idx_startups_unique_email_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_startups_unique_email_active_free
  ON public.startups (((author->>'email'::text)))
  WHERE (archived = false AND plan = 'free');
