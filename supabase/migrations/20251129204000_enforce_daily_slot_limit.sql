-- Enforce 6 free startups per day limit at the database level
-- This prevents race conditions where multiple users submit at the same time

CREATE OR REPLACE FUNCTION check_daily_slot_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    daily_count INTEGER;
    max_free_per_day INTEGER := 6;
BEGIN
    -- Only check for free plan submissions
    IF NEW.plan = 'free' THEN
        -- Count existing free startups for this launch date
        SELECT COUNT(*)
        INTO daily_count
        FROM public.startups
        WHERE launch_date = NEW.launch_date
        AND plan = 'free';
        
        -- If already at or over limit, reject the insert
        IF daily_count >= max_free_per_day THEN
            RAISE EXCEPTION 'Daily free slot limit reached for %. Maximum % free startups per day allowed. Please choose a different date or upgrade to Featured.', 
                NEW.launch_date, max_free_per_day;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_daily_slot_limit_trigger ON public.startups;

-- Create trigger to check before insert
CREATE TRIGGER enforce_daily_slot_limit_trigger
    BEFORE INSERT ON public.startups
    FOR EACH ROW
    EXECUTE FUNCTION check_daily_slot_limit();

-- Also create a function to get available slots for a date
CREATE OR REPLACE FUNCTION get_available_slots(target_date DATE)
RETURNS TABLE(
    free_slots_remaining INTEGER,
    free_count INTEGER,
    total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    max_free_per_day INTEGER := 6;
    current_free_count INTEGER;
    current_total_count INTEGER;
BEGIN
    -- Count free startups for this date
    SELECT COUNT(*)
    INTO current_free_count
    FROM public.startups
    WHERE launch_date = target_date
    AND plan = 'free';
    
    -- Count total startups for this date
    SELECT COUNT(*)
    INTO current_total_count
    FROM public.startups
    WHERE launch_date = target_date;
    
    RETURN QUERY SELECT 
        max_free_per_day - current_free_count AS free_slots_remaining,
        current_free_count AS free_count,
        current_total_count AS total_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_daily_slot_limit TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_slots TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_slots TO anon;
