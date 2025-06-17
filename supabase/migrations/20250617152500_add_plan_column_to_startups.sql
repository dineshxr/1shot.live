-- Add plan column to startups table
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- Update RLS policy to allow reading plan
DROP POLICY IF EXISTS "Allow public read access" ON public.startups;
CREATE POLICY "Allow public read access" 
ON public.startups 
FOR SELECT 
USING (true);

-- Update RLS policy to allow authenticated users to update plan
DROP POLICY IF EXISTS "Allow authenticated users to update" ON public.startups;
CREATE POLICY "Allow authenticated users to update" 
ON public.startups 
FOR UPDATE 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
