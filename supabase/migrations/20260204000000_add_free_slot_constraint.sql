-- Add constraint to prevent more than 6 free submissions per day
-- This ensures that the frontend grey-out logic is enforced at the database level

-- First, create a function to check free slot count
CREATE OR REPLACE FUNCTION check_free_slot_capacity()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_free_slots INTEGER := 6;
BEGIN
    -- Count existing free submissions for the same launch date
    SELECT COUNT(*) INTO current_count
    FROM startups
    WHERE launch_date = NEW.launch_date
    AND plan = 'free'
    AND id != NEW.id; -- Exclude the current record for updates
    
    -- If this is a free plan submission, check capacity
    IF NEW.plan = 'free' AND current_count >= max_free_slots THEN
        RAISE EXCEPTION 'Free slot capacity exceeded for date %. Maximum allowed: %s, Current: %s',
            NEW.launch_date, max_free_slots, current_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS enforce_free_slot_capacity ON startups;
CREATE TRIGGER enforce_free_slot_capacity
    BEFORE INSERT OR UPDATE ON startups
    FOR EACH ROW
    EXECUTE FUNCTION check_free_slot_capacity();

-- Add a check constraint as additional protection
ALTER TABLE startups 
ADD CONSTRAINT IF NOT EXISTS check_free_plan_launch_date_capacity 
CHECK (
    plan != 'free' OR 
    launch_date IS NULL OR
    (SELECT COUNT(*) FROM startups s2 
     WHERE s2.launch_date = startups.launch_date 
     AND s2.plan = 'free' 
     AND s2.id != startups.id) < 6
);

-- Create an index for better performance on the capacity check
CREATE INDEX IF NOT EXISTS idx_startups_launch_date_plan 
ON startups(launch_date, plan) 
WHERE plan = 'free';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_free_slot_capacity() TO authenticated;
GRANT EXECUTE ON FUNCTION check_free_slot_capacity() TO service_role;
