-- Drop existing functions first
DROP FUNCTION IF EXISTS get_next_launch_date(TEXT);
DROP FUNCTION IF EXISTS get_next_launch_date();
DROP FUNCTION IF EXISTS get_listings_to_go_live();

-- Change timezone from PST (America/Los_Angeles) to EST (America/New_York)
-- Startups can only be published Monday-Friday, not Saturday or Sunday

-- Update get_next_launch_date function to use EST timezone
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
    current_hour_est INTEGER;
BEGIN
    -- Get current date and hour in EST (America/New_York)
    next_date := (NOW() AT TIME ZONE 'America/New_York')::DATE;
    current_hour_est := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/New_York'));
    
    -- If it's currently a weekday and before 8 AM EST, we can use today
    day_of_week := EXTRACT(DOW FROM next_date); -- 0=Sunday, 1=Monday, etc.
    
    -- If it's a weekday (Monday=1 through Friday=5) and before 8 AM, check if we can use today
    IF day_of_week >= 1 AND day_of_week <= 5 AND current_hour_est < 8 THEN
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
    IF day_of_week >= 1 AND day_of_week <= 5 AND current_hour_est >= 8 THEN
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

-- Update get_listings_to_go_live function to use EST timezone
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
    today_est DATE;
    current_hour_est INTEGER;
BEGIN
    -- Get current date and hour in EST (America/New_York)
    today_est := (NOW() AT TIME ZONE 'America/New_York')::DATE;
    current_hour_est := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/New_York'));
    
    -- Return listings if it's 8 AM EST or later on any weekday (Monday-Friday)
    IF current_hour_est >= 8 THEN
        RETURN QUERY
        SELECT 
            s.id,
            s.title,
            (s.author->>'email')::TEXT as author_email,
            s.launch_date
        FROM public.startups s
        WHERE s.launch_date = today_est
        AND s.is_live = FALSE
        AND s.notification_sent = FALSE
        -- Ensure we only publish on weekdays (Monday=1 through Friday=5)
        AND EXTRACT(DOW FROM today_est) BETWEEN 1 AND 5;
    END IF;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_next_launch_date TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_launch_date TO anon;
GRANT EXECUTE ON FUNCTION get_listings_to_go_live TO authenticated;
