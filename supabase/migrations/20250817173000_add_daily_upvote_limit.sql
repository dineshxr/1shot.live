-- Add daily upvote limit functionality
-- Update votes table to track when votes were cast
ALTER TABLE votes ADD COLUMN IF NOT EXISTS voted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for efficient daily vote queries
CREATE INDEX IF NOT EXISTS idx_votes_user_date ON votes (user_id, DATE(voted_at AT TIME ZONE 'America/Los_Angeles'));

-- Update upvote_startup function to enforce daily limit
CREATE OR REPLACE FUNCTION upvote_startup(startup_id_param UUID)
RETURNS JSON AS $$
DECLARE
    current_user_id UUID;
    existing_vote_id UUID;
    today_date DATE;
    daily_vote_count INTEGER;
    new_upvote_count INTEGER;
    result JSON;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'User not authenticated');
    END IF;
    
    -- Get today's date in PST
    today_date := DATE(NOW() AT TIME ZONE 'America/Los_Angeles');
    
    -- Check how many votes user has made today
    SELECT COUNT(*) INTO daily_vote_count
    FROM votes 
    WHERE user_id = current_user_id 
    AND DATE(voted_at AT TIME ZONE 'America/Los_Angeles') = today_date;
    
    -- Check if user has already voted for this startup
    SELECT id INTO existing_vote_id
    FROM votes 
    WHERE user_id = current_user_id AND startup_id = startup_id_param;
    
    IF existing_vote_id IS NOT NULL THEN
        -- Remove existing vote
        DELETE FROM votes WHERE id = existing_vote_id;
        
        -- Update startup upvote count
        UPDATE startups 
        SET upvote_count = GREATEST(upvote_count - 1, 0),
            updated_at = NOW()
        WHERE id = startup_id_param;
        
        -- Get updated count
        SELECT upvote_count INTO new_upvote_count
        FROM startups WHERE id = startup_id_param;
        
        RETURN json_build_object(
            'success', true, 
            'action', 'removed',
            'upvote_count', new_upvote_count,
            'user_voted', false
        );
    ELSE
        -- Check daily limit (1 upvote per day)
        IF daily_vote_count >= 1 THEN
            RETURN json_build_object('error', 'You can only upvote once per day');
        END IF;
        
        -- Add new vote
        INSERT INTO votes (user_id, startup_id, voted_at)
        VALUES (current_user_id, startup_id_param, NOW());
        
        -- Update startup upvote count
        UPDATE startups 
        SET upvote_count = upvote_count + 1,
            updated_at = NOW()
        WHERE id = startup_id_param;
        
        -- Get updated count
        SELECT upvote_count INTO new_upvote_count
        FROM startups WHERE id = startup_id_param;
        
        RETURN json_build_object(
            'success', true, 
            'action', 'added',
            'upvote_count', new_upvote_count,
            'user_voted', true
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's upvoted startups
CREATE OR REPLACE FUNCTION get_user_upvoted_startups()
RETURNS TABLE (
    id UUID,
    name TEXT,
    tagline TEXT,
    url TEXT,
    slug TEXT,
    launch_date DATE,
    upvote_count INTEGER,
    daily_rank INTEGER,
    voted_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.tagline,
        s.url,
        s.slug,
        s.launch_date,
        s.upvote_count,
        s.daily_rank,
        v.voted_at
    FROM startups s
    INNER JOIN votes v ON s.id = v.startup_id
    WHERE v.user_id = auth.uid()
    ORDER BY v.voted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_upvoted_startups() TO authenticated;
