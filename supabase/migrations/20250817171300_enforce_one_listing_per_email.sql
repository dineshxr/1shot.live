-- Enforce one listing per email user and add notification tracking
-- This migration adds constraints and functions for better user management

-- Add email notification tracking columns
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT FALSE;
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS went_live_at TIMESTAMPTZ;

-- Create unique constraint for one listing per email (excluding deleted/archived)
-- We'll use a partial unique index to allow multiple listings only if they're archived
CREATE UNIQUE INDEX IF NOT EXISTS unique_email_per_active_listing 
ON public.startups ((author->>'email')) 
WHERE (author->>'email') IS NOT NULL AND (archived IS NULL OR archived = FALSE);

-- Function to check if user already has an active listing
CREATE OR REPLACE FUNCTION check_user_listing_limit(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_count INTEGER;
BEGIN
    -- Count active listings for this email
    SELECT COUNT(*)
    INTO existing_count
    FROM public.startups
    WHERE (author->>'email')::text = user_email
    AND (archived IS NULL OR archived = FALSE);
    
    -- Return true if user can submit (has no active listings)
    RETURN existing_count = 0;
END;
$$;

-- Function to get next available weekday launch date
CREATE OR REPLACE FUNCTION get_next_launch_date(plan_type TEXT DEFAULT 'free')
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_date DATE;
    day_of_week INTEGER;
    daily_count INTEGER;
    max_daily_free INTEGER := 6;
BEGIN
    -- Start with today in PST
    next_date := (NOW() AT TIME ZONE 'America/Los_Angeles')::DATE;
    
    -- Find the next available weekday
    LOOP
        day_of_week := EXTRACT(DOW FROM next_date); -- 0=Sunday, 1=Monday, etc.
        
        -- Skip weekends (Saturday=6, Sunday=0)
        IF day_of_week >= 1 AND day_of_week <= 5 THEN
            -- Check if this date has capacity for free plans
            IF plan_type = 'free' THEN
                SELECT COUNT(*)
                INTO daily_count
                FROM public.startups
                WHERE launch_date = next_date
                AND plan = 'free';
                
                -- If under daily limit, return this date
                IF daily_count < max_daily_free THEN
                    RETURN next_date;
                END IF;
            ELSE
                -- Premium/featured can always be scheduled
                RETURN next_date;
            END IF;
        END IF;
        
        -- Move to next day
        next_date := next_date + INTERVAL '1 day';
        
        -- Safety check to prevent infinite loop
        IF next_date > (CURRENT_DATE + INTERVAL '60 days') THEN
            RAISE EXCEPTION 'No available launch dates found within 60 days';
        END IF;
    END LOOP;
END;
$$;

-- Function to mark listings as live and track timing
CREATE OR REPLACE FUNCTION mark_listing_live(listing_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.startups
    SET 
        is_live = TRUE,
        went_live_at = NOW()
    WHERE id = listing_id;
END;
$$;

-- Function to get listings that should go live today at 8 AM PST
CREATE OR REPLACE FUNCTION get_listings_to_go_live()
RETURNS TABLE(
    id UUID,
    title TEXT,
    author_email TEXT,
    launch_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today_pst DATE;
    current_hour_pst INTEGER;
BEGIN
    -- Get current date and hour in PST
    today_pst := (NOW() AT TIME ZONE 'America/Los_Angeles')::DATE;
    current_hour_pst := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Los_Angeles'));
    
    -- Only return listings if it's 8 AM PST or later
    IF current_hour_pst >= 8 THEN
        RETURN QUERY
        SELECT 
            s.id,
            s.title,
            (s.author->>'email')::TEXT as author_email,
            s.launch_date
        FROM public.startups s
        WHERE s.launch_date = today_pst
        AND s.is_live = FALSE
        AND s.notification_sent = FALSE;
    END IF;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_user_listing_limit TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_launch_date TO authenticated;
GRANT EXECUTE ON FUNCTION mark_listing_live TO authenticated;
GRANT EXECUTE ON FUNCTION get_listings_to_go_live TO authenticated;

-- Add archived column if it doesn't exist (for soft deletes)
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
