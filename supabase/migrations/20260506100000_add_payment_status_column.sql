-- Add payment_status to startups so paid plans (premium/featured) can be
-- inserted BEFORE the user pays without going live until Stripe confirms payment.
--
-- States:
--   'paid'    — confirmed payment OR the row predates this column (default)
--   'pending' — paid-plan submission awaiting Stripe webhook confirmation
--
-- Free-plan rows do not need a meaningful payment_status; they default to 'paid'.
-- Live-publishing functions (send-live-notifications, publish-stuck-paid-startups)
-- must filter on payment_status='paid' for paid plans so unpaid rows are not
-- promoted to is_live=true.

ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'paid';

CREATE INDEX IF NOT EXISTS idx_startups_payment_status
  ON public.startups(payment_status)
  WHERE payment_status <> 'paid';
