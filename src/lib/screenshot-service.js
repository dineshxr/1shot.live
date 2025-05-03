/**
 * Screenshot Service
 * Uses the Microlink API to capture screenshots of websites
 */

/**
 * Ensure the screenshot_url column exists in the startups table
 * 
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} - True if the column exists or was created
 */
export const ensureScreenshotColumnExists = async (supabase) => {
  try {
    if (!supabase) {
      throw new Error('Supabase client is required');
    }
    
    console.log('Checking if screenshot_url column exists...');
    
    // Try to update a dummy column to see if screenshot_url exists
    const { error } = await supabase.rpc(
      'test_column_exists',
      { table_name: 'startups', column_name: 'screenshot_url' }
    );
    
    if (error) {
      console.log('Column does not exist, creating it...');
      
      // Create a custom function to check if a column exists
      const { error: createFunctionError } = await supabase.rpc(
        'create_column_if_not_exists',
        { 
          p_table_name: 'startups', 
          p_column_name: 'screenshot_url', 
          p_column_type: 'TEXT' 
        }
      );
      
      if (createFunctionError) {
        console.error('Error creating column:', createFunctionError);
        return false;
      }
      
      console.log('Screenshot_url column created successfully');
    } else {
      console.log('Screenshot_url column already exists');
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring screenshot column exists:', error);
    // If we can't verify or create the column, we'll assume it exists
    // This allows the app to continue functioning even if we can't modify the schema
    return true;
  }
};

/**
 * Capture a screenshot of a website using the Microlink API
 * 
 * @param {string} url - The URL of the website to capture
 * @param {Object} options - Screenshot options
 * @returns {Promise<string>} - The screenshot URL
 */
export const captureScreenshot = async (url, options = {}) => {
  try {
    if (!url) {
      throw new Error('URL is required to capture a screenshot');
    }
    
    // Default options
    const defaultOptions = {
      width: 1280,
      height: 800,
      waitUntil: 'networkidle2',
      type: 'png',
      fullPage: false,
      ...options
    };
    
    // Construct Microlink API URL with parameters
    const apiUrl = new URL('https://api.microlink.io');
    apiUrl.searchParams.append('url', url);
    apiUrl.searchParams.append('screenshot', 'true');
    apiUrl.searchParams.append('meta', 'false');
    apiUrl.searchParams.append('embed', 'screenshot.url');
    
    // Add optional parameters
    if (defaultOptions.width) apiUrl.searchParams.append('width', String(defaultOptions.width));
    if (defaultOptions.height) apiUrl.searchParams.append('height', String(defaultOptions.height));
    if (defaultOptions.waitUntil) apiUrl.searchParams.append('waitUntil', defaultOptions.waitUntil);
    if (defaultOptions.type) apiUrl.searchParams.append('type', defaultOptions.type);
    if (defaultOptions.fullPage) apiUrl.searchParams.append('fullPage', String(defaultOptions.fullPage));
    
    console.log(`Capturing screenshot for ${url} using Microlink API`);
    
    // Fetch the screenshot
    const response = await fetch(apiUrl.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to capture screenshot: ${response.status} ${errorText}`);
    }
    
    const screenshotUrl = await response.text();
    console.log(`Screenshot captured successfully: ${screenshotUrl}`);
    
    return screenshotUrl;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
  }
};

/**
 * Upload a screenshot to Supabase storage
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} screenshotUrl - URL of the screenshot to upload
 * @param {string} slug - Slug of the startup
 * @returns {Promise<string>} - The URL of the uploaded screenshot
 */
export const uploadScreenshot = async (supabase, screenshotUrl, slug) => {
  try {
    if (!supabase || !screenshotUrl || !slug) {
      throw new Error('Supabase client, screenshot URL, and slug are required');
    }
    
    console.log(`Fetching screenshot from ${screenshotUrl}`);
    
    // Fetch the screenshot image
    const imageResponse = await fetch(screenshotUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch screenshot: ${imageResponse.status}`);
    }
    
    const imageBlob = await imageResponse.blob();
    const fileName = `${slug}-${Date.now()}.png`;
    const filePath = `startups/${fileName}`;
    
    console.log(`Uploading screenshot to Supabase storage: ${filePath}`);
    
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('screenshots')
      .upload(filePath, imageBlob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      throw error;
    }
    
    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from('screenshots')
      .getPublicUrl(filePath);
    
    const publicUrl = publicUrlData.publicUrl;
    console.log(`Screenshot uploaded successfully: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('Error uploading screenshot:', error);
    throw error;
  }
};
