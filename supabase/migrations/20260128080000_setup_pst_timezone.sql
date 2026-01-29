-- Setup PST timezone for the entire database
-- This migration ensures all database operations use Pacific Standard Time

-- Create function to get current timezone
CREATE OR REPLACE FUNCTION get_current_timezone()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT current_setting('timezone', true);
$$;

-- Create function to get database time
CREATE OR REPLACE FUNCTION get_database_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT NOW();
$$;

-- Create function to set timezone to PST
CREATE OR REPLACE FUNCTION set_timezone_to_pst()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  BEGIN
    EXECUTE 'SET timezone = ''America/Los_Angeles''';
    RETURN 'America/Los_Angeles';
  END;
$$;

-- Create function to get PST time
CREATE OR REPLACE FUNCTION get_pst_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT NOW() AT TIME ZONE 'America/Los_Angeles';
$$;

-- Create function to convert timestamp to PST date
CREATE OR REPLACE FUNCTION to_pst_date(timestamp_input TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (timestamp_input AT TIME ZONE 'America/Los_Angeles')::DATE;
$$;

-- Create function to get current PST hour
CREATE OR REPLACE FUNCTION get_pst_hour()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Los_Angeles')::INTEGER;
$$;

-- Create function to get current PST date
CREATE OR REPLACE FUNCTION get_pst_date()
RETURNS DATE
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (NOW() AT TIME ZONE 'America/Los_Angeles')::DATE;
$$;

-- Create function to check if current time is after 8 AM PST
CREATE OR REPLACE FUNCTION is_after_8am_pst()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Los_Angeles') >= 8;
$$;

-- Create function to check if current time is a weekday in PST
CREATE OR REPLACE FUNCTION is_weekday_pst()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Los_Angeles') BETWEEN 1 AND 5;
$$;

-- Update the database timezone setting
SET timezone = 'America/Los_Angeles';

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_current_timezone() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_database_time() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION set_timezone_to_pst() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_pst_time() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION to_pst_date(TIMESTAMPTZ) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_pst_hour() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_pst_date() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION is_after_8am_pst() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION is_weekday_pst() TO authenticated, anon, service_role;
