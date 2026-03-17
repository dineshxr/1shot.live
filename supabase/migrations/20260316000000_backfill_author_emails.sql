-- Migration to help identify and fix startups with missing author emails
-- This fixes the issue where startups don't have author.email set, preventing notification emails

-- Create a function to list startups that are live but missing author emails
CREATE OR REPLACE FUNCTION list_startups_missing_emails()
RETURNS TABLE(
  startup_id UUID,
  startup_title TEXT,
  startup_slug TEXT,
  is_live BOOLEAN,
  notification_sent BOOLEAN,
  launch_date DATE,
  author_data JSONB,
  has_email BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.slug,
    s.is_live,
    s.notification_sent,
    s.launch_date,
    s.author,
    (s.author->>'email' IS NOT NULL AND s.author->>'email' != '') as has_email
  FROM startups s
  WHERE s.is_live = true
    AND (s.author IS NULL OR s.author->>'email' IS NULL OR s.author->>'email' = '')
  ORDER BY s.launch_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to reset notification status for startups with emails
-- This allows the cron job to resend notifications
CREATE OR REPLACE FUNCTION reset_notification_status(startup_ids UUID[])
RETURNS TABLE(
  startup_id UUID,
  startup_title TEXT,
  was_reset BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  UPDATE startups
  SET 
    notification_sent = false,
    notification_sent_at = NULL
  WHERE id = ANY(startup_ids)
    AND author->>'email' IS NOT NULL
    AND author->>'email' != ''
  RETURNING id, title, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON FUNCTION list_startups_missing_emails() IS 'Lists all live startups that are missing author email addresses';
COMMENT ON FUNCTION reset_notification_status(UUID[]) IS 'Resets notification_sent flag for specified startups so emails can be resent';
