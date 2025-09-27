-- Fix Monday publishing issue
-- This migration updates the get_next_launch_date function to properly handle Monday publishing

-- Drop and recreate the function with fixed logic
DROP FUNCTION IF EXISTS get_next_launch_date(TEXT);

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
    current_hour_pst INTEGER;
BEGIN
    -- Get current date and hour in PST
    next_date := (NOW() AT TIME ZONE 'America/Los_Angeles')::DATE;
    current_hour_pst := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Los_Angeles'));
    
    -- If it's currently a weekday and before 8 AM PST, we can use today
    day_of_week := EXTRACT(DOW FROM next_date); -- 0=Sunday, 1=Monday, etc.
    
    -- If it's a weekday (Monday=1 through Friday=5) and before 8 AM, check if we can use today
    IF day_of_week >= 1 AND day_of_week <= 5 AND current_hour_pst < 8 THEN
        -- Check if this date has capacity for free plans
        IF plan_type = 'free' THEN
            SELECT COUNT(*)
            INTO daily_count
            FROM public.startups
            WHERE launch_date = next_date
            AND plan = 'free';
            
            -- If under daily limit, return today
            IF daily_count < max_daily_free THEN
                RETURN next_date;
            END IF;
        ELSE
            -- Premium/featured can always be scheduled for today if it's before 8 AM
            RETURN next_date;
        END IF;
    END IF;
    
    -- If we can't use today (after 8 AM, weekend, or at capacity), find next available weekday
    -- If it's after 8 AM on a weekday, move to next day
    IF day_of_week >= 1 AND day_of_week <= 5 AND current_hour_pst >= 8 THEN
        next_date := next_date + INTERVAL '1 day';
    END IF;
    
    -- If it's weekend, move to next Monday
    IF day_of_week = 0 THEN -- Sunday
        next_date := next_date + INTERVAL '1 day'; -- Move to Monday
    ELSIF day_of_week = 6 THEN -- Saturday
        next_date := next_date + INTERVAL '2 days'; -- Move to Monday
    END IF;
    
    -- Find the next available weekday with capacity
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

-- Also update the get_listings_to_go_live function to ensure proper Monday handling
DROP FUNCTION IF EXISTS get_listings_to_go_live();

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
    
    -- Return listings if it's 8 AM PST or later on any weekday (including Monday)
    -- This ensures Monday startups go live on Monday at 8 AM PST
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
        AND s.notification_sent = FALSE
        -- Ensure we only publish on weekdays
        AND EXTRACT(DOW FROM today_pst) BETWEEN 1 AND 5; -- Monday=1 through Friday=5
    END IF;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_next_launch_date TO authenticated;
GRANT EXECUTE ON FUNCTION get_listings_to_go_live TO authenticated;

-- Add a comment to track this fix
COMMENT ON FUNCTION get_next_launch_date IS 'Fixed Monday publishing issue - ensures startups scheduled for Monday publish on Monday at 8 AM PST';
COMMENT ON FUNCTION get_listings_to_go_live IS 'Fixed Monday publishing issue - ensures Monday startups go live on Monday at 8 AM PST';
