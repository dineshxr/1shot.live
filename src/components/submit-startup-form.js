import { supabaseClient } from '../lib/supabase-client.js';
import { captureScreenshot, uploadScreenshot } from '../lib/screenshot-service.js';
// Using global analytics functions defined in main.js instead of imports
// html and useState are defined globally in main.js
/* global html, useState, useEffect */

import { Confetti } from './confetti.js';

export const SubmitStartupForm = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    url: "",
    xProfile: "",
    projectName: "",
    description: "",
    slug: "",
    category: "", // Category selection
    plan: "free", // Default plan selection
    launchDate: "" // Launch date selection
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); // Track which page of the form we're on
  const [showSuccessPage, setShowSuccessPage] = useState(false); // New state to control success page visibility
  // Removed submission limits - users can now submit multiple times
  const [isDuplicate, setIsDuplicate] = useState(false); // Track if the URL is a duplicate
  const [availableLaunchDates, setAvailableLaunchDates] = useState([]); // Available launch dates
  const [userHasPreviousSubmissions, setUserHasPreviousSubmissions] = useState(false); // Track if user has submitted before
  const [checkingPreviousSubmissions, setCheckingPreviousSubmissions] = useState(false); // Loading state for checking submissions

  // Generate available launch dates using database function for consistency
  const generateLaunchDates = async () => {
    const dates = [];
    const supabase = supabaseClient();
    
    // Use database function to get next available date for free plan
    const { data: nextFreeDate, error: freeDateError } = await supabase.rpc('get_next_launch_date', { plan_type: 'free' });
    
    if (freeDateError) {
      console.error('Error getting next free launch date:', freeDateError);
      return [];
    }
    
    // Start from the next available free date
    let currentDate = new Date(nextFreeDate + 'T00:00:00');
    let daysChecked = 0;
    
    // Generate 3 available dates
    while (dates.length < 3 && daysChecked < 30) {
      const day = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Only use weekdays (Monday = 1 through Friday = 5)
      if (day >= 1 && day <= 5) {
        const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
        const formattedDate = currentDate.toLocaleDateString('en-US', dateOptions);
        const dateValue = currentDate.toISOString().split('T')[0];
        
        // Check current capacity for this date
        const { data, error, count } = await supabase
          .from('startups')
          .select('id', { count: 'exact' })
          .eq('plan', 'free')
          .eq('launch_date', dateValue);
        
        if (error) {
          console.error('Error checking launch date availability:', error);
        }
        
        // Limit free submissions to 6 per day (same as database function)
        const freeAvailable = (count || 0) < 6;
        
        dates.push({
          date: formattedDate,
          value: dateValue,
          freeAvailable: freeAvailable,
          premiumAvailable: true, // Featured always available
          freeCount: count || 0
        });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      daysChecked++;
    }
    
    return dates;
  };
  
  // Select a launch date
  const selectLaunchDate = (dateValue) => {
    setFormData(prev => ({ ...prev, launchDate: dateValue }));
  };
  
  // Removed daily submission limit check - users can submit unlimited times

  // Check if user has previous submissions
  const checkUserPreviousSubmissions = async () => {
    if (!window.auth || !window.auth.isAuthenticated()) {
      setUserHasPreviousSubmissions(false);
      return;
    }

    const authUser = window.auth.getCurrentUser();
    if (!authUser || !authUser.email) {
      setUserHasPreviousSubmissions(false);
      return;
    }

    setCheckingPreviousSubmissions(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('startups')
        .select('id')
        .eq('author->>email', authUser.email)
        .limit(1);

      if (error) {
        console.error('Error checking previous submissions:', error);
        setUserHasPreviousSubmissions(false);
      } else {
        setUserHasPreviousSubmissions(data && data.length > 0);
        // If user has previous submissions, default to premium plan
        if (data && data.length > 0) {
          setFormData(prev => ({ ...prev, plan: 'premium' }));
        }
      }
    } catch (err) {
      console.error('Error checking previous submissions:', err);
      setUserHasPreviousSubmissions(false);
    } finally {
      setCheckingPreviousSubmissions(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    
    // Track form open event
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('form_open');
    }
    
    // Generate available launch dates when form opens
    const loadLaunchDates = async () => {
      const dates = await generateLaunchDates();
      setAvailableLaunchDates(dates);
    };
    
    // Check if user has previous submissions
    checkUserPreviousSubmissions();
    
    loadLaunchDates();
    
    // Removed Turnstile captcha integration
  }, [isOpen]); // Re-run when modal opens

  // Generate a slug from the project name
  const generateSlug = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Limit length
  };
  
  // Add random suffix to make a slug unique
  const makeUniqueSlug = (baseSlug) => {
    const randomSuffix = Math.floor(Math.random() * 10000);
    return `${baseSlug}-${randomSuffix}`;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // If project name changes, auto-generate a slug if slug is empty or was auto-generated
    if (name === 'projectName' && value) {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        // Only auto-update slug if it's empty or matches previous auto-generated pattern
        slug: !prev.slug || prev.slug === generateSlug(prev.projectName) ? generateSlug(value) : prev.slug
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Removed existing submission check - users can submit multiple startups

  // Check for duplicate URL
  const checkDuplicateUrl = async () => {
    if (!formData.url) return;

    try {
      const normalizeUrl = (url) => {
        let normalized = url.trim().replace(/^(https?:\/\/)?(www\.)?/, '');
        if (normalized.endsWith('/')) {
          normalized = normalized.slice(0, -1);
        }
        return normalized;
      };

      const normalizedUrl = normalizeUrl(formData.url);

      const supabase = supabaseClient();
      const { data, error } = await supabase.rpc('check_duplicate_url', { p_url: normalizedUrl });

      if (error) {
        console.error('Error checking duplicate URL:', error);
        return;
      }

      if (data) {
        setError('This URL has already been submitted. If you want to feature it, please contact us.');
        setIsDuplicate(true);
      } else {
        setIsDuplicate(false);
      }
    } catch (error) {
      console.error('Error in checkDuplicateUrl:', error);
    }
  };

  const goToNextPage = async () => {
    // Validate current page before proceeding
    if (currentPage === 1) {
      if (!formData.url) {
        setError("Please enter a valid URL");
        return;
      }
      if (!formData.slug) {
        setError("Please enter a slug for your product");
        return;
      }
      if (!formData.xProfile) {
        setError("Please enter your X username");
        return;
      }

      // Check for duplicate URL
      await checkDuplicateUrl();
      if (isDuplicate) {
        return; // Stop if it's a duplicate
      }
      
      // Clear any existing errors and proceed to next page
      setError(null);
      setCurrentPage(2);
      window.trackEvent(window.ANALYTICS_EVENTS.FORM_NEXT_PAGE, { page: 1 });
    }
  };

  const goToPreviousPage = () => {
    setCurrentPage(currentPage - 1);
    window.trackEvent(window.ANALYTICS_EVENTS.FORM_PREV_PAGE, { page: currentPage });
  };

  const selectPlan = (plan) => {
    setFormData(prev => ({ ...prev, plan }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // Track form submission attempt
    window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT);

    try {

      // Validate form data before submission
      if (!formData.url) {
        throw new Error("Please enter a valid URL");
      }
      if (!formData.projectName) {
        throw new Error("Please enter a project name");
      }
      if (!formData.slug) {
        throw new Error("Please enter a slug for your project");
      }
      if (!formData.category) {
        throw new Error("Please select a category for your startup");
      }

      // Initialize Supabase client with better error handling
      let supabase;
      try {
        supabase = supabaseClient();
        console.log("Supabase client initialized successfully");
      } catch (initError) {
        console.error("Failed to initialize Supabase client:", initError);
        throw new Error("Database connection failed. Please try again later.");
      }
      
      // Check connection to Supabase before proceeding
      try {
        // Simple ping to check connection
        const { data: pingData, error: pingError } = await supabase
          .from('startups')
          .select('count')
          .limit(1);
          
        if (pingError) {
          console.error("Supabase connection check failed:", pingError);
          throw new Error("Could not connect to the database. Please check your internet connection and try again.");
        }
        
        console.log("Supabase connection verified successfully");
      } catch (connectionError) {
        console.error("Database connection test failed:", connectionError);
        throw new Error("Network error: Could not connect to the database. Please check your internet connection and try again.");
      }

      console.log("Submitting startup to Supabase:", {
        title: formData.projectName,
        url: formData.url,
        slug: formData.slug
      });
      
      // Capture screenshot of the website
      let screenshotUrl = null;
      try {
        console.log(`Attempting to capture screenshot for ${formData.url}`);
        // First try to capture the screenshot
        const capturedScreenshotUrl = await captureScreenshot(formData.url, {
          width: 1280,
          height: 800,
          waitUntil: 'networkidle2'
        });
        
        if (capturedScreenshotUrl) {
          console.log(`Screenshot captured, uploading to Supabase storage`);
          // Then upload it to Supabase storage
          screenshotUrl = await uploadScreenshot(supabase, capturedScreenshotUrl, formData.slug);
          console.log(`Screenshot uploaded successfully: ${screenshotUrl}`);
        }
      } catch (screenshotError) {
        // Don't fail the whole submission if screenshot fails
        console.error('Error capturing/uploading screenshot:', screenshotError);
      }

      // Submit to Supabase with better error handling and retry logic
      let retryCount = 0;
      const maxRetries = 3;
      let lastError = null;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`Attempt ${retryCount + 1} of ${maxRetries} to submit startup`);
          
          // Check Supabase connection before attempting insert
          try {
            // Simple ping query to verify connection
            const { error: pingError } = await supabase
              .from('startups')
              .select('count')
              .limit(1);
              
            if (pingError) {
              console.error('Supabase connection test failed:', pingError);
              throw new Error(`Connection test failed: ${pingError.message || 'Unknown error'}`);
            }
          } catch (pingErr) {
            console.error('Connection test error:', pingErr);
            // Wait before retry
            retryCount++;
            if (retryCount < maxRetries) {
              const waitTime = 1000 * retryCount;
              console.log(`Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            } else {
              throw pingErr; // Let the outer catch handle it
            }
          }
          
          // Get authenticated user info if available
          let authorInfo = {
            name: formData.xProfile.replace('@', ''),
            profile_url: `https://x.com/${formData.xProfile.replace('@', '')}`,
            avatar: `https://unavatar.io/twitter/${formData.xProfile.replace('@', '')}`
          };
          
          // If user is authenticated via Supabase, use their email info
          if (window.auth && window.auth.isAuthenticated()) {
            const authUser = window.auth.getCurrentUser();
            if (authUser) {
              authorInfo = {
                name: authUser.email?.split('@')[0] || formData.xProfile.replace('@', ''),
                profile_url: `https://x.com/${formData.xProfile.replace('@', '')}`,
                avatar: `https://unavatar.io/twitter/${formData.xProfile.replace('@', '')}`,
                email: authUser.email
              };
            }
          }

          // Proceed with the actual insert
          const { data, error } = await supabase
            .from('startups')
            .insert([
              {
                title: formData.projectName,
                url: formData.url,
                description: formData.description,
                slug: formData.slug,
                category: formData.category,
                author: authorInfo,
                screenshot_url: screenshotUrl,
                plan: formData.plan,
                launch_date: formData.launchDate || await (async () => {
                  // Always use database function to get next available launch date
                  const { data: nextDate, error: dateError } = await supabase.rpc('get_next_launch_date');
                  if (dateError) {
                    console.error('Error getting next launch date:', dateError);
                    // Fallback to next weekday
                    const pdt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                    let nextDay = new Date(pdt);
                    nextDay.setDate(pdt.getDate() + 1);
                    
                    // Find next weekday (Monday-Friday)
                    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
                      nextDay.setDate(nextDay.getDate() + 1);
                    }
                    
                    return nextDay.getFullYear() + '-' + 
                           String(nextDay.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(nextDay.getDate()).padStart(2, '0');
                  }
                  return nextDate;
                })()
              }
            ])
            .select('id, title, url, description, slug, author, screenshot_url, plan, launch_date')
            .single();

          if (error) {
            console.error(`Supabase insert error (attempt ${retryCount + 1}):`, error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            lastError = error;
            
            // Handle specific database constraint errors
            if (error.code === '23505') { // PostgreSQL unique constraint violation code
              // Check which constraint was violated
              if (error.message && error.message.includes('startups_slug_key')) {
                // Slug already exists - try with a unique slug automatically
                console.log(`Slug "${formData.slug}" already exists, trying with a unique slug...`);
                
                // Generate a unique slug by adding a random suffix
                const uniqueSlug = makeUniqueSlug(formData.slug);
                console.log(`Generated unique slug: ${uniqueSlug}`);
                
                // Try again with the unique slug
                const { data: retryData, error: retryError } = await supabase
                  .from('startups')
                  .insert([{
                    title: formData.projectName,
                    url: formData.url,
                    description: formData.description,
                    slug: uniqueSlug,
                    category: formData.category,
                    author: {
                      name: formData.xProfile.replace('@', ''),
                      profile_url: `https://x.com/${formData.xProfile.replace('@', '')}`,
                      avatar: `https://unavatar.io/twitter/${formData.xProfile.replace('@', '')}`
                    },
                    screenshot_url: screenshotUrl,
                    plan: formData.plan,
                    launch_date: formData.launchDate || (() => {
                      // Fallback to next weekday
                      const pdt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                      let nextDay = new Date(pdt);
                      nextDay.setDate(pdt.getDate() + 1);
                      
                      // Find next weekday (Monday-Friday)
                      while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
                        nextDay.setDate(nextDay.getDate() + 1);
                      }
                      
                      return nextDay.getFullYear() + '-' + 
                             String(nextDay.getMonth() + 1).padStart(2, '0') + '-' + 
                             String(nextDay.getDate()).padStart(2, '0');
                    })(),
                  }])
                  .select('id, title, url, description, slug, author, screenshot_url, plan, launch_date')
                  .single();
                
                if (retryError) {
                  // If still failing, now show an error message
                  window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: false, error: 'duplicate_slug_retry_failed' });
                  throw new Error(`Unable to generate a unique slug. Please try again with a different name.`);
                } else {
                  // Success with the unique slug!
                  console.log("Startup submitted successfully with a unique slug:", retryData);
                  window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: true, used_unique_slug: true });
                  
                  // Reset form
                  setFormData({ url: "", xProfile: "", projectName: "", description: "", slug: "", category: "" });
                  setTurnstileToken(null);
                  // Reset the widget
                  if (window.turnstile) {
                    window.turnstile.reset();
                  }
                  setSuccess(true);
                  // Trigger refresh of startups list
                  window.dispatchEvent(new Event("refresh-startups"));
                  return retryData; // Exit the retry loop on success
                }
              } else if (error.message && error.message.includes('startups_url_key')) {
                // URL already exists
                window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: false, error: 'duplicate_url' });
                throw new Error(`This URL has already been submitted. Each startup can only be submitted once.`);
              } else {
                // Check if this is a user trying to submit for free when they already have submissions
                if (formData.plan === 'free' && userHasPreviousSubmissions) {
                  window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: false, error: 'free_limit_exceeded' });
                  throw new Error('You have already used your free submission. Each user can only submit once for free. Please choose the Featured plan for additional submissions.');
                }
                // Other unique constraint violation
                window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: false, error: 'duplicate_entry' });
                throw new Error('This startup appears to be already registered. Each startup can only be submitted once.');
              }
            }
            // If it's a network error, retry; otherwise, throw immediately
            else if (error.message && (error.message.includes("fetch") || error.message.includes("network") || error.code === "PGRST116")) {
              retryCount++;
              if (retryCount < maxRetries) {
                // Wait before retrying (exponential backoff)
                const waitTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
                console.log(`Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
              }
            } else {
              // Not a network error, don't retry
              // Track submission error
              window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: false, error: error.message });
              throw new Error(error.message || "Failed to submit startup");
            }
          } else {
            // Success!
            console.log("Startup submitted successfully:", data);
            
            // Show success page
            setSuccess(true);
            setShowSuccessPage(true);
            
            // Save the submitted data for the success page
            const submittedData = { ...formData };
            
            // Track success page view
            try {
              window.trackEvent(window.ANALYTICS_EVENTS.SUCCESS_PAGE_VIEW, { plan: submittedData.plan });
            } catch (analyticsError) {
              console.warn('Analytics error:', analyticsError);
            }
            
            return data; // Exit the retry loop on success
          }
        } catch (dbError) {
          console.error(`Database operation failed (attempt ${retryCount + 1}):`, dbError);
          lastError = dbError;
          
          // If it's a network error, retry
          if (dbError.message && (dbError.message.includes("fetch") || dbError.message.includes("network"))) {
            retryCount++;
            if (retryCount < maxRetries) {
              // Wait before retrying (exponential backoff)
              const waitTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
              console.log(`Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          } else {
            // Not a network error, don't retry
            throw dbError;
          }
        }
      }
      
      // If we've exhausted all retries
      if (lastError) {
        // Track submission error after all retries
        window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: false, error: lastError.message });
        
        if (lastError.message && (lastError.message.includes("fetch") || lastError.message.includes("network"))) {
          throw new Error("Network error: Could not connect to the database after multiple attempts. Please check your internet connection and try again later.");
        } else {
          throw lastError;
        }
      }

      // Track successful submission
      window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT, { success: true });
      
      // Trigger refresh of startups list
      window.dispatchEvent(new Event("refresh-startups"));
      
      // Save the submitted data for the success page
      const submittedData = { ...formData };
      
      // Reset form data
      setFormData({ url: "", xProfile: "", projectName: "", description: "", slug: "", category: "" });
      setTurnstileToken(null);
      // Reset the widget
      if (window.turnstile) {
        window.turnstile.reset();
      }
      
      // Show success page
      setSuccess(true);
      setShowSuccessPage(true);
      
      // Track success page view
      window.trackEvent(window.ANALYTICS_EVENTS.SUCCESS_PAGE_VIEW, { plan: submittedData.plan });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Render the success page if showSuccessPage is true
  if (showSuccessPage) {
    return html`
      <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
        onClick=${(e) => {
          // Close modal when clicking the backdrop
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 w-full max-w-md rounded relative my-8 max-h-[90vh] overflow-y-auto"
          onClick=${(e) => {
            // Prevent modal close when clicking inside the content
            e.stopPropagation();
          }}
        >
          <button
            onClick=${onClose}
            class="absolute top-2 right-2 text-black hover:text-gray-700"
            aria-label="Close"
          >
            <i class="fas fa-times text-xl"></i>
          </button>

          <h2 class="text-2xl font-bold mb-2 text-black">Startup Submitted Successfully! 🚀</h2>
          
          <div class="mb-6 p-4 bg-green-100 border-2 border-green-500 rounded text-center">
            <p class="text-green-700 font-bold text-xl mb-2">Congratulations on Submitting Your Startup!</p>
            ${formData.plan === 'premium' ? '' : html`
              <p class="text-green-700">You've successfully launched on our Product Hunt alternative platform.</p>
              <p class="text-green-700 mt-2">Your startup will be featured on the Home Page shortly.</p>
            `}
          </div>
          
          ${formData.plan === 'premium' ? html`
            <div class="mb-4 bg-yellow-300 p-3 border border-black rounded">
              <p class="font-bold mb-2"><a href="https://submit.gumroad.com/l/featured" target="_blank" class="underline hover:text-blue-700">Pay Now</a></p>
              <p>After you pay - Your startup will be featured on the Home Page.</p>
              <p class="mt-2 font-bold">Your featured submission will be prioritized and displayed immediately.</p>
            </div>
          ` : html`
            <div class="mb-4 bg-blue-100 p-3 border border-black rounded">
              <p>Your submission has been added to the queue and will be featured soon.</p>
            </div>
          `}
          
          <!-- Badge and Embed Section -->
          <div class="mt-6 p-4 border-2 border-black rounded bg-orange-50">
            <h3 class="font-bold text-lg mb-2 flex items-center">
              <i class="fas fa-award mr-2 text-orange-600"></i>
              Get Your Badge & Keep Your 37+ DR Backlink!
            </h3>
            <div class="mb-4 p-3 bg-yellow-100 border border-yellow-400 rounded">
              <p class="text-sm font-bold text-yellow-800 mb-1">⚠️ Important:</p>
              <p class="text-sm text-yellow-800">Add our badge to your website to make your listing <strong>permanent</strong> and keep your 37+ DR backlink as <strong>dofollow</strong>. Without the badge, your backlink will become nofollow after 30 days. <strong>Note:</strong> You need at least 3 upvotes to secure your permanent backlink.</p>
            </div>
            
            <div class="space-y-4">
              <!-- Download Badge Option -->
              <div class="border border-gray-300 rounded p-3">
                <h4 class="font-bold mb-2">📥 Download Badge</h4>
                <p class="text-sm text-gray-600 mb-3">Download our badge image and add it to your website manually.</p>
                <button 
                  onClick=${() => {
                    // Create badge download
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 200;
                    canvas.height = 60;
                    
                    // Draw badge background
                    ctx.fillStyle = '#3B82F6';
                    ctx.fillRect(0, 0, 200, 60);
                    
                    // Draw text
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Featured on', 100, 20);
                    ctx.font = 'bold 16px Arial';
                    ctx.fillText('SubmitHunt', 100, 40);
                    
                    // Download
                    const link = document.createElement('a');
                    link.download = 'submithunt-badge.png';
                    link.href = canvas.toDataURL();
                    link.click();
                  }}
                  class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold"
                >
                  Download Badge PNG
                </button>
              </div>
              
              <!-- Embed Code Option -->
              <div class="border border-gray-300 rounded p-3">
                <h4 class="font-bold mb-2">🔗 Embed Code</h4>
                <p class="text-sm text-gray-600 mb-3">Copy and paste this code into your website's HTML.</p>
                <div class="bg-gray-100 p-3 rounded text-xs font-mono mb-3 overflow-x-auto">
                  <code id="embed-code">
&lt;a href="https://submithunt.com" target="_blank" rel="noopener"&gt;
  &lt;img src="https://submithunt.com/badge.png" alt="Featured on SubmitHunt" width="150" height="45" /&gt;
&lt;/a&gt;
                  </code>
                </div>
                <button 
                  onClick=${() => {
                    const embedCode = document.getElementById('embed-code').textContent;
                    navigator.clipboard.writeText(embedCode).then(() => {
                      // Show copied feedback
                      const btn = event.target;
                      const originalText = btn.textContent;
                      btn.textContent = 'Copied!';
                      btn.classList.add('bg-green-500');
                      btn.classList.remove('bg-gray-500');
                      setTimeout(() => {
                        btn.textContent = originalText;
                        btn.classList.remove('bg-green-500');
                        btn.classList.add('bg-gray-500');
                      }, 2000);
                    });
                  }}
                  class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 font-bold"
                >
                  Copy Embed Code
                </button>
              </div>
            </div>
          </div>
          
          <div class="mt-6 p-4 border-2 border-black rounded bg-gray-50">
            <h3 class="font-bold text-lg mb-2">What's Next?</h3>
            <p class="mb-2">1. Get at least 3 upvotes to secure your permanent backlink</p>
            <p class="mb-2">2. Add the badge to your website to keep your dofollow backlink</p>
            <p class="mb-2">3. Share your startup submission on social media and tag @submithunt</p>
            <p class="mb-2">4. Tell others about your experience with our Product Hunt alternative platform</p>
          </div>
          
          <div class="mt-6 flex flex-col items-center">
            <p class="mb-3 font-bold">Share your launch:</p>
            <div class="flex space-x-4">
              <a href="https://twitter.com/intent/tweet?text=I%20just%20launched%20my%20startup%20on%20submithunt.com%21" target="_blank" class="p-2 bg-blue-400 hover:bg-blue-500 rounded-full">
                <i class="fab fa-twitter text-white text-xl"></i>
              </a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=https://submithunt.com" target="_blank" class="p-2 bg-blue-700 hover:bg-blue-800 rounded-full">
                <i class="fab fa-linkedin-in text-white text-xl"></i>
              </a>
            </div>
          </div>
          
          <${Confetti} />
          
          <div class="flex justify-center mt-6">
            <button
              onClick=${onClose}
              class="px-6 py-2 bg-blue-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 font-bold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Render the regular form if not showing success page
  return html`
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick=${(e) => {
        // Close modal when clicking the backdrop
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 w-full max-w-md rounded relative my-8 max-h-[90vh] overflow-y-auto"
        onClick=${(e) => {
          // Prevent modal close when clicking inside the form
          e.stopPropagation();
        }}
      >
        <button
          onClick=${onClose}
          class="absolute top-2 right-2 text-black hover:text-gray-700"
          aria-label="Close"
        >
          <i class="fas fa-times text-xl"></i>
        </button>

        <h2 class="text-2xl font-bold mb-2 text-black">Submit Your Startup</h2>
        <p class="text-gray-700 mb-3">Launch your project on the best Product Hunt alternative for startup founders and indie hackers.</p>
        
        ${success ? html`
          <div class="mb-6 p-4 bg-green-100 border-2 border-green-500 rounded text-center">
            <p class="text-green-700 font-bold text-xl mb-2">Processing your submission...</p>
            <p class="text-green-700">Please wait while we redirect you.</p>
          </div>
        ` : html`
          <div class="mb-4 bg-yellow-300 p-3 border border-black rounded">
            <p class="font-bold flex items-center">
              <span class="mr-2">🚀</span> Submit Your Startup, Get a 37+ DR Backlink
            </p>
            <p class="text-sm mt-1">Join hundreds of founders who chose SubmitHunt as their Product Hunt alternative</p>
            <p class="text-xs mt-2 font-medium text-gray-700">
              <span class="mr-1">⭐</span> Get at least 3 upvotes to secure your permanent backlink
            </p>
          </div>

          ${error &&
          html`
            <div class="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded">
              <p class="text-red-700">${error}</p>
            </div>
          `}

          <form onSubmit=${handleSubmit}>
                  
          ${currentPage === 1 ? html`
          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="projectName">
              Startup Name
            </label>
            <input
              type="text"
              id="projectName"
              name="projectName"
              placeholder="My Awesome Startup"
              value=${formData.projectName}
              onInput=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="url">
              Startup URL
            </label>
            <input
              type="url"
              id="url"
              name="url"
              value=${formData.url}
              onInput=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="https://mystartup.com"
              required
            />
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="slug">
              Slug
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              value=${formData.slug}
              onInput=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="my-awesome-startup"
              required
            />
            <div class="text-sm text-gray-500 mt-2">
              A unique identifier for your startup that will be used in the URL (e.g. submit-startup/#my-startup)
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="description">
              Description
            </label>
            <input
              type="text"
              id="description"
              name="description"
              value=${formData.description}
              onInput=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="A short description of the startup"
            />
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="category">
              Category
            </label>
            <select
              id="category"
              name="category"
              value=${formData.category}
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              required
            >
              <option value="">Select a category</option>
              <option value="AI/ML">🤖 AI/ML</option>
              <option value="Other">📦 Other</option>
              <option value="Design">🎨 Design</option>
              <option value="Web App">🌐 Web App</option>
              <option value="SaaS">⚡ SaaS</option>
              <option value="Gaming">🎮 Gaming</option>
              <option value="Developer Tools">👨‍💻 Developer Tools</option>
              <option value="Productivity">📊 Productivity</option>
              <option value="Social">👥 Social</option>
              <option value="API/Service">🔗 API/Service</option>
              <option value="Marketing">📈 Marketing</option>
              <option value="E-commerce">🛒 E-commerce</option>
              <option value="Health & Fitness">🏃‍♂️ Health & Fitness</option>
              <option value="Education">📚 Education</option>
              <option value="Chrome Extension">🧩 Chrome Extension</option>
              <option value="Mobile App">📱 Mobile App</option>
            </select>
          </div>

          <div class="mb-6">
            <label class="block text-black font-bold mb-2" for="xProfile">
              X Username
            </label>
            <input
              type="text"
              id="xProfile"
              name="xProfile"
              value=${formData.xProfile}
              onInput=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="jack"
              required
            />
            <div class="text-sm text-gray-500 mt-2">
              We need your X username so we know the creator of the startup.
            </div>
          </div>

          <div class="mb-6">
            <div
              class="cf-turnstile"
            ></div>
          </div>

          <div class="flex justify-end">
            <button
              type="button"
              onClick=${onClose}
              class="mr-2 px-4 py-2 bg-gray-200 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-300 font-bold"
              disabled=${loading}
            >
              Cancel
            </button>
            ${currentPage === 1 ? html`
              <button
                type="button"
                onClick=${goToNextPage}
                class="neo-button px-4 py-2 bg-blue-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 font-bold disabled:opacity-50"
                disabled=${loading}
              >
                Next
              </button>
            ` : ''}
          </div>
          ` : currentPage === 2 ? html`
            <div class="mb-6">
              <h3 class="text-xl font-bold mb-4 text-black">Choose Your Launch Plan</h3>
              <p class="text-gray-700 mb-3">Select how you want to submit your startup to our Product Hunt alternative platform:</p>
              
              ${checkingPreviousSubmissions ? html`
                <div class="text-center py-4">
                  <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <p class="text-sm text-gray-600 mt-2">Checking your submission history...</p>
                </div>
              ` : ''}
              
              ${userHasPreviousSubmissions ? html`
                <div class="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                  <div class="flex items-center mb-2">
                    <i class="fas fa-info-circle text-yellow-600 mr-2"></i>
                    <h4 class="font-bold text-yellow-800">Previous Submission Detected</h4>
                  </div>
                  <p class="text-yellow-700 text-sm">
                    You have already submitted a startup for free. Each user can only submit once for free. 
                    To submit additional startups, please choose the Featured plan.
                  </p>
                </div>
              ` : ''}
              
              <div class="mb-6">
                <div class="flex flex-col space-y-6">
                  <!-- Free Option - Only show if user has no previous submissions -->
                  ${!userHasPreviousSubmissions ? html`
                    <div 
                      class="border-4 ${formData.plan === 'free' ? 'border-blue-500' : 'border-black'} p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-all"
                      onClick=${() => selectPlan('free')}
                    >
                      <div class="flex justify-between items-center mb-2">
                        <h4 class="text-lg font-bold">Free</h4>
                        <span class="text-lg font-bold">$0</span>
                      </div>
                      <ul class="list-disc pl-5 space-y-1 mb-3">
                        <li>Live on homepage for 7 days</li>
                        <li>High authority backlink (requires 3+ upvotes)</li>
                        <li>Standard launch queue</li>
                      </ul>
                      ${formData.plan === 'free' ? html`
                        <div class="bg-blue-100 text-blue-800 text-sm font-bold py-1 px-2 rounded inline-block">
                          <i class="fas fa-check mr-1"></i> Selected
                        </div>
                      ` : ''}
                    </div>
                  ` : html`
                    <!-- Disabled Free Option for returning users -->
                    <div class="border-4 border-gray-300 p-4 rounded-lg bg-gray-100 opacity-60">
                      <div class="flex justify-between items-center mb-2">
                        <h4 class="text-lg font-bold text-gray-500">Free</h4>
                        <span class="text-lg font-bold text-gray-500">$0</span>
                      </div>
                      <ul class="list-disc pl-5 space-y-1 mb-3 text-gray-500">
                        <li>Live on homepage for 7 days</li>
                        <li>High authority backlink (requires 3+ upvotes)</li>
                        <li>Standard launch queue</li>
                      </ul>
                      <div class="bg-gray-200 text-gray-600 text-sm font-bold py-1 px-2 rounded inline-block">
                        <i class="fas fa-lock mr-1"></i> Already Used
                      </div>
                    </div>
                  `}
                  
                  <!-- Featured Option -->
                  <div 
                    class="border-4 ${formData.plan === 'premium' ? 'border-blue-500' : 'border-black'} p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-all"
                    onClick=${() => {
                      window.open('/featured.html', '_blank');
                    }}
                  >
                    <div class="flex justify-between items-center mb-2">
                      <h4 class="text-lg font-bold">Featured</h4>
                      <span class="text-lg font-bold">$5</span>
                    </div>
                    <ul class="list-disc pl-5 space-y-1 mb-3">
                      <li>Live on homepage for 14 days</li>
                      <li>Guaranteed high authority backlink</li>
                      <li>Skip the queue (launch today)</li>
                      <li>Featured in our startup newsletter</li>
                    </ul>
                    ${formData.plan === 'premium' ? html`
                      <div class="bg-blue-100 text-blue-800 text-sm font-bold py-1 px-2 rounded inline-block">
                        <i class="fas fa-check mr-1"></i> Selected
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
              
              ${formData.plan === 'free' ? html`
              <div class="mb-6">
                <h3 class="text-xl font-bold mb-4 text-black">Choose Your Launch Date</h3>
                <p class="text-gray-700 mb-3">Select from available launch dates:</p>
                
                ${availableLaunchDates.length >= 3 && availableLaunchDates.slice(0, 3).every(date => date.freeCount >= 6) ? html`
                  <div class="mb-4 p-4 bg-yellow-100 border-2 border-yellow-400 rounded">
                    <h4 class="font-bold text-yellow-800 mb-2">🚀 All Free Slots Are Full!</h4>
                    <p class="text-yellow-800 mb-3">All free launch dates are currently full (6/6 slots each). Consider upgrading to Featured to launch immediately!</p>
                    <button
                      type="button"
                      onClick=${() => {
                        window.open('/featured.html', '_blank');
                      }}
                      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold"
                    >
                      Upgrade to Featured ($5)
                    </button>
                  </div>
                ` : availableLaunchDates.filter(date => date.freeAvailable).length < 2 && availableLaunchDates.filter(date => date.freeAvailable).length > 0 ? html`
                  <div class="mb-4 p-4 bg-blue-100 border-2 border-blue-400 rounded">
                    <h4 class="font-bold text-blue-800 mb-2">📅 Limited Free Slots Available</h4>
                    <p class="text-blue-800 mb-3">Only ${availableLaunchDates.filter(date => date.freeAvailable).length} free slot${availableLaunchDates.filter(date => date.freeAvailable).length === 1 ? '' : 's'} remaining. Consider Featured for guaranteed immediate launch!</p>
                    <button
                      type="button"
                      onClick=${() => {
                        window.open('/featured.html', '_blank');
                      }}
                      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold"
                    >
                      Learn About Featured ($5)
                    </button>
                  </div>
                ` : ''}
                
                <div class="space-y-4">
                  ${availableLaunchDates.slice(0, 3).map(date => html`
                    <div 
                      class="border-2 ${formData.launchDate === date.value ? 'border-blue-500' : 'border-black'} p-4 rounded-lg ${!date.freeAvailable && formData.plan === 'free' ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer hover:bg-gray-50'} transition-all ${!date.freeAvailable ? 'relative' : ''}"
                      onClick=${!date.freeAvailable && formData.plan === 'free' ? null : () => selectLaunchDate(date.value)}
                    >
                      ${!date.freeAvailable ? html`
                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div class="w-full h-0.5 bg-red-500 transform rotate-12"></div>
                        </div>
                      ` : ''}
                      <div class="flex justify-between items-center ${!date.freeAvailable ? 'relative z-10' : ''}">
                        <h4 class="text-lg font-bold ${!date.freeAvailable ? 'text-gray-500' : ''}">${date.date}</h4>
                        <div class="flex flex-col items-end">
                          <div class="flex items-center">
                            <span class="inline-block w-3 h-3 rounded-full ${date.freeAvailable ? 'bg-green-500' : 'bg-red-500'} mr-2"></span>
                            <span class="${date.freeAvailable ? 'text-green-700' : 'text-red-700'} text-sm">
                              ${date.freeAvailable ? `Free (${date.freeCount}/6)` : 'Full (6/6)'}
                            </span>
                          </div>
                          <div class="flex items-center mt-1">
                            <span class="inline-block w-3 h-3 rounded-full ${date.premiumAvailable ? 'bg-green-500' : 'bg-red-500'} mr-2"></span>
                            <span class="${date.premiumAvailable ? 'text-green-700' : 'text-red-700'} text-sm">Featured available</span>
                          </div>
                        </div>
                      </div>
                      ${formData.launchDate === date.value ? html`
                        <div class="mt-2 bg-blue-100 text-blue-800 text-sm font-bold py-1 px-2 rounded inline-block">
                          <i class="fas fa-check mr-1"></i> Selected
                        </div>
                      ` : ''}
                      <div class="mt-2 text-sm text-gray-600">
                        ${!date.freeAvailable ? html`
                          <span class="text-red-600 font-bold">❌ Date unavailable - all 6 free slots filled</span>
                        ` : date.freeCount > 0 ? `${date.freeCount} startup${date.freeCount !== 1 ? 's' : ''} scheduled` : 'No startups scheduled yet'}
                      </div>
                    </div>
                  `)}
                </div>
              </div>
              ` : ''}
              
              
              <div class="cf-turnstile"></div>
              
              <div class="flex justify-end mt-6">
                <button
                  type="button"
                  onClick=${goToPreviousPage}
                  class="mr-2 px-4 py-2 bg-gray-200 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-300 font-bold"
                  disabled=${loading}
                >
                  Previous
                </button>
                ${formData.plan === 'free' && availableLaunchDates.filter(date => date.freeAvailable).length > 0 ? html`
                  <button
                    type="submit"
                    class="neo-button px-4 py-2 bg-green-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold disabled:opacity-50"
                    disabled=${loading}
                  >
                    ${loading ? "Submitting..." : "Submit"}
                  </button>
                ` : formData.plan === 'featured' ? html`
                  <button
                    type="submit"
                    class="neo-button px-4 py-2 bg-green-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold disabled:opacity-50"
                    disabled=${loading}
                  >
                    ${loading ? "Submitting..." : "Submit"}
                  </button>
                ` : ''}
              </div>
            </div>
          ` : ''}
          </form>
        `}
      </div>
    </div>
  `;
};