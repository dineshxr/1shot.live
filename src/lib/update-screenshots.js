/**
 * Utility script to update screenshots for existing startups
 * Can be run manually or scheduled to update screenshots periodically
 */
import { supabaseClient } from './supabase-client.js';
import { captureScreenshot, uploadScreenshot } from './screenshot-service.js';

/**
 * Update screenshots for all startups that don't have one
 * @returns {Promise<Object>} Results of the update operation
 */
export const updateAllScreenshots = async () => {
  try {
    console.log('Starting screenshot update for all startups...');
    const supabase = supabaseClient();
    
    // Get all startups without screenshots
    const { data: startups, error } = await supabase
      .from('startups')
      .select('*')
      .is('screenshot_url', null);
    
    if (error) {
      throw new Error(`Error fetching startups: ${error.message}`);
    }
    
    console.log(`Found ${startups.length} startups without screenshots`);
    
    // Process each startup
    const results = {
      total: startups.length,
      success: 0,
      failed: 0,
      details: []
    };
    
    for (const startup of startups) {
      try {
        console.log(`Processing startup: ${startup.title} (${startup.url})`);
        
        // Capture screenshot
        const screenshotUrl = await captureScreenshot(startup.url, {
          width: 1280,
          height: 800,
          waitUntil: 'networkidle2'
        });
        
        if (screenshotUrl) {
          // Upload to Supabase storage
          const storedUrl = await uploadScreenshot(supabase, screenshotUrl, startup.slug);
          
          // Update startup record
          const { error: updateError } = await supabase
            .from('startups')
            .update({ 
              screenshot_url: storedUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', startup.id);
          
          if (updateError) {
            throw new Error(`Error updating startup: ${updateError.message}`);
          }
          
          console.log(`✅ Successfully updated screenshot for ${startup.title}`);
          results.success++;
          results.details.push({
            id: startup.id,
            slug: startup.slug,
            status: 'success',
            url: storedUrl
          });
        }
      } catch (err) {
        console.error(`❌ Failed to update screenshot for ${startup.title}:`, err);
        results.failed++;
        results.details.push({
          id: startup.id,
          slug: startup.slug,
          status: 'failed',
          error: err.message
        });
      }
      
      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Screenshot update completed:', results);
    return results;
  } catch (error) {
    console.error('Error in updateAllScreenshots:', error);
    throw error;
  }
};

/**
 * Update screenshot for a specific startup by ID
 * @param {string} startupId - ID of the startup to update
 * @returns {Promise<Object>} Result of the update operation
 */
export const updateStartupScreenshot = async (startupId) => {
  try {
    console.log(`Updating screenshot for startup ID: ${startupId}`);
    const supabase = supabaseClient();
    
    // Get the startup
    const { data: startup, error } = await supabase
      .from('startups')
      .select('*')
      .eq('id', startupId)
      .single();
    
    if (error) {
      throw new Error(`Error fetching startup: ${error.message}`);
    }
    
    if (!startup) {
      throw new Error(`Startup with ID ${startupId} not found`);
    }
    
    // Capture screenshot
    const screenshotUrl = await captureScreenshot(startup.url, {
      width: 1280,
      height: 800,
      waitUntil: 'networkidle2'
    });
    
    if (screenshotUrl) {
      // Upload to Supabase storage
      const storedUrl = await uploadScreenshot(supabase, screenshotUrl, startup.slug);
      
      // Update startup record
      const { error: updateError } = await supabase
        .from('startups')
        .update({ 
          screenshot_url: storedUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', startup.id);
      
      if (updateError) {
        throw new Error(`Error updating startup: ${updateError.message}`);
      }
      
      console.log(`✅ Successfully updated screenshot for ${startup.title}`);
      return {
        status: 'success',
        startup,
        screenshot_url: storedUrl
      };
    }
    
    throw new Error('Failed to capture screenshot');
  } catch (error) {
    console.error('Error in updateStartupScreenshot:', error);
    throw error;
  }
};

// If this script is run directly (not imported)
if (typeof window !== 'undefined' && window.location.pathname.includes('update-screenshots')) {
  updateAllScreenshots()
    .then(results => {
      console.log('Screenshot update completed:', results);
      alert(`Screenshot update completed: ${results.success} successful, ${results.failed} failed`);
    })
    .catch(error => {
      console.error('Error updating screenshots:', error);
      alert(`Error updating screenshots: ${error.message}`);
    });
}
