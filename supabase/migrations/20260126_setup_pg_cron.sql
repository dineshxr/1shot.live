-- ============================================================================
-- PG_CRON SETUP FOR SEND-LIVE-NOTIFICATIONS
-- ============================================================================
-- 
-- IMPORTANT: This SQL must be run in your Supabase Dashboard SQL Editor
-- (not as a migration) because pg_cron and pg_net are only available in
-- production Supabase, not in local development.
--
-- Steps to set up:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy and paste this entire script
-- 3. Click "Run"
-- 4. Verify in Database → Extensions that pg_cron and pg_net are enabled
-- 5. Check cron.job table to see the scheduled job
--
-- ============================================================================

-- Step 1: Enable required extensions (if not already enabled)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Step 2: Grant usage on cron schema to postgres role
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Step 3: Create the cron job to call the Edge Function every hour
-- The function is called via HTTP POST using pg_net
--
-- Schedule: '0 * * * *' = Every hour at minute 0
-- Timezone: pg_cron uses UTC by default

select cron.schedule(
  'send-live-notifications-hourly',     -- unique job name
  '0 * * * *',                           -- every hour at minute 0
  $$
  select net.http_post(
    url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/send-live-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- USEFUL QUERIES FOR MANAGING THE CRON JOB
-- ============================================================================

-- View all scheduled cron jobs:
-- SELECT * FROM cron.job;

-- View recent job runs:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Unschedule the job:
-- SELECT cron.unschedule('send-live-notifications-hourly');

-- Update the schedule to run at a different time (e.g., 8 AM PST = 16:00 UTC):
-- SELECT cron.unschedule('send-live-notifications-hourly');
-- SELECT cron.schedule('send-live-notifications-hourly', '0 16 * * *', $$ ... $$);

-- ============================================================================
-- TESTING
-- ============================================================================

-- To test the Edge Function manually, run:
-- SELECT net.http_post(
--   url := 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/send-live-notifications',
--   headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
--   body := '{}'::jsonb
-- );
