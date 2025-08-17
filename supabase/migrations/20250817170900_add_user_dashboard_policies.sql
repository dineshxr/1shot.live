-- Add user dashboard policies for startups table
-- This migration ensures users can only update their own listings

-- Drop existing update policy
DROP POLICY IF EXISTS "Allow authenticated users to update" ON public.startups;

-- Create new policy that allows users to update only their own listings
-- Users can update listings where their email matches the author.email field
CREATE POLICY "Allow users to update own listings" ON public.startups
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND 
        (author->>'email')::text = auth.jwt()->>'email'
    )
    WITH CHECK (
        auth.role() = 'authenticated' AND 
        (author->>'email')::text = auth.jwt()->>'email'
    );

-- Ensure the existing read policy allows everyone to view listings
DROP POLICY IF EXISTS "Allow public read access" ON public.startups;
CREATE POLICY "Allow public read access" ON public.startups
    FOR SELECT
    USING (true);

-- Add policy to allow authenticated users to insert their own listings
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON public.startups;
CREATE POLICY "Allow authenticated users to insert" ON public.startups
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Add policy to allow users to delete their own listings (optional)
DROP POLICY IF EXISTS "Allow users to delete own listings" ON public.startups;
CREATE POLICY "Allow users to delete own listings" ON public.startups
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND 
        (author->>'email')::text = auth.jwt()->>'email'
    );
