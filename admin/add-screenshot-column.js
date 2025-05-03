/**
 * Script to add screenshot_url column to startups table
 * and update existing startups with screenshots
 */

import { supabaseClient } from '../src/lib/supabase-client.js';
import { captureScreenshot, uploadScreenshot } from '../src/lib/screenshot-service.js';

// Main function
async function addScreenshotColumn() {
  try {
    console.log('Starting to add screenshot_url column and update startups...');
    const supabase = supabaseClient();
    
    // 1. Add screenshot_url column if it doesn't exist
    console.log('Adding screenshot_url column...');
    const { error: columnError } = await supabase.rpc(
      'execute_sql',
      { sql: 'ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS screenshot_url TEXT;' }
    );
    
    if (columnError) {
      console.log('Error adding column using RPC, trying direct SQL...');
      // Try direct SQL query
      const { error: directError } = await supabase.from('_sql').select('*').execute(
        'ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS screenshot_url TEXT;'
      );
      
      if (directError) {
        console.error('Failed to add column:', directError);
        console.log('Proceeding anyway, column might already exist...');
      }
    }
    
    // 2. Get all startups
    const { data: startups, error: fetchError } = await supabase
      .from('startups')
      .select('*');
    
    if (fetchError) {
      throw new Error(`Error fetching startups: ${fetchError.message}`);
    }
    
    console.log(`Found ${startups.length} startups to process`);
    
    // 3. Process each startup
    for (const startup of startups) {
      try {
        console.log(`Processing startup: ${startup.title} (${startup.url})`);
        
        // Skip if already has a screenshot
        if (startup.screenshot_url) {
          console.log(`Startup ${startup.title} already has a screenshot, skipping...`);
          continue;
        }
        
        // Capture screenshot
        const screenshotUrl = await captureScreenshot(startup.url);
        
        if (screenshotUrl) {
          // Upload to Supabase storage
          const storedUrl = await uploadScreenshot(supabase, screenshotUrl, startup.slug);
          
          // Update startup record
          const { error: updateError } = await supabase
            .from('startups')
            .update({ screenshot_url: storedUrl })
            .eq('id', startup.id);
          
          if (updateError) {
            console.error(`Error updating startup ${startup.title}:`, updateError);
          } else {
            console.log(`✅ Successfully updated screenshot for ${startup.title}`);
          }
        }
      } catch (err) {
        console.error(`❌ Failed to process startup ${startup.title}:`, err);
      }
      
      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Finished processing all startups');
    
  } catch (error) {
    console.error('Error in addScreenshotColumn:', error);
  }
}

// Run the function
addScreenshotColumn()
  .then(() => console.log('Script completed'))
  .catch(err => console.error('Script failed:', err));
