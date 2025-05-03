-- Function to test if a column exists in a table
CREATE OR REPLACE FUNCTION public.test_column_exists(table_name text, column_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
  ) INTO column_exists;
  
  RETURN column_exists;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.test_column_exists TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_column_exists TO service_role;

-- Function to create a column if it doesn't exist
CREATE OR REPLACE FUNCTION public.create_column_if_not_exists(
  p_table_name text,
  p_column_name text,
  p_column_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  column_exists boolean;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) INTO column_exists;
  
  -- Create column if it doesn't exist
  IF NOT column_exists THEN
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', 
                  p_table_name, p_column_name, p_column_type);
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_column_if_not_exists TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_column_if_not_exists TO service_role;

-- Add screenshot_url column to startups table if it doesn't exist
SELECT public.create_column_if_not_exists('startups', 'screenshot_url', 'TEXT');
