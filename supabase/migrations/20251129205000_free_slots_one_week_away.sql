-- Update get_next_launch_date to start free slots 1 week away
-- This promotes paid submissions by making free users wait

DROP FUNCTION IF EXISTS get_next_launch_date(TEXT);
DROP FUNCTION IF EXISTS get_next_launch_date();

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
    
    -- For FREE plans: start 1 week from now to promote paid submissions
    IF plan_type = 'free' THEN
        next_date := next_date + INTERVAL '7 days';
    ELSE
        -- For PAID plans: can launch today if before 8 AM EST on a weekday
        day_of_week := EXTRACT(DOW FROM next_date); -- 0=Sunday, 1=Monday, etc.
        
        IF day_of_week >= 1 AND day_of_week <= 5 AND current_hour_est < 8 THEN
            -- It's a weekday before 8 AM, can use today
            RETURN next_date;
        END IF;
        
        -- Otherwise start from tomorrow
        next_date := next_date + INTERVAL '1 day';
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_next_launch_date TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_launch_date TO anon;
