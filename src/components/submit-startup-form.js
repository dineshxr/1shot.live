import { supabaseClient } from '../lib/supabase-client.js';
import { captureScreenshot, uploadScreenshot } from '../lib/screenshot-service.js';
// Using global analytics functions defined in main.js instead of imports

import { Confetti } from './confetti.js';

export const SubmitStartupForm = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    url: "",
    xProfile: "",
    projectName: "",
    description: "",
    slug: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    // Track form open event
    window.trackEvent(window.ANALYTICS_EVENTS.FORM_OPEN);
    
    // Check if Turnstile script is already loaded
    const existingScript = document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    let script;
    
    // Function to render Turnstile when script is loaded
    const renderTurnstile = () => {
      // Clear any existing Turnstile widgets first
      const turnstileContainer = document.querySelector('.cf-turnstile');
      if (turnstileContainer) {
        // Remove any existing Turnstile widgets
        turnstileContainer.innerHTML = '';
        
        // Only render if turnstile is available and the container is empty
        if (window.turnstile && turnstileContainer.children.length === 0) {
          window.turnstile.render(turnstileContainer, {
            sitekey: window.PUBLIC_ENV.turnstileSiteKey,
            theme: "light",
            callback: function (token) {
              setTurnstileToken(token);
            },
          });
        }
      }
    };
    
    if (existingScript) {
      // If script already exists, just render the Turnstile
      renderTurnstile();
    } else {
      // Load Turnstile script when component mounts
      script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      
      // Set up event listener for script load
      script.onload = renderTurnstile;
      
      document.body.appendChild(script);
    }
    
    return () => {
      // Clean up only if we created the script
      if (script && script.parentNode) {
        document.body.removeChild(script);
      }
      
      // Reset Turnstile if it exists
      if (window.turnstile) {
        window.turnstile.reset();
      }
    };
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // Track form submission attempt
    window.trackEvent(window.ANALYTICS_EVENTS.FORM_SUBMIT);

    try {
      if (!turnstileToken) {
        throw new Error(
          "Please complete the Turnstile challenge. If it's not showing, please refresh the page."
        );
      }

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
          
          const { data, error } = await supabase
            .from('startups')
            .insert([
              {
                title: formData.projectName,
                url: formData.url,
                description: formData.description,
                slug: formData.slug,
                screenshot_url: screenshotUrl, // Include the screenshot URL if available
                author: {
                  name: formData.xProfile,
                  profile_url: `https://x.com/${formData.xProfile}`,
                  avatar: `https://unavatar.io/twitter/${formData.xProfile}`,
                },
              },
            ])
            .select()
            .single();

          if (error) {
            console.error(`Supabase insert error (attempt ${retryCount + 1}):`, error);
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
                    author: {
                      name: formData.xProfile,
                      profile_url: `https://x.com/${formData.xProfile}`,
                      avatar: `https://unavatar.io/twitter/${formData.xProfile}`,
                    },
                  }])
                  .select()
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
                  setFormData({ url: "", xProfile: "", projectName: "", description: "", slug: "" });
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
      
      // Reset form
      setFormData({ url: "", xProfile: "", projectName: "", description: "", slug: "" });
      setTurnstileToken(null);
      // Reset the widget
      if (window.turnstile) {
        window.turnstile.reset();
      }
      setSuccess(true);
      
      // Trigger refresh of startups list
      window.dispatchEvent(new Event("refresh-startups"));
      
      // Auto-close the form after 3 seconds
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (success) {
    return html`
      <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      >
        <div
          class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 w-full max-w-md rounded relative my-8 max-h-[90vh] overflow-y-auto flex flex-col items-center"
        >
          <${Confetti} show=${true} />
          <h2 class="text-2xl font-bold mb-4 text-green-700 text-center">🎉 Submission Successful!</h2>
          <p class="mb-6 text-center text-black">Thank you for submitting your startup! We'll review it soon. 🚀</p>
          <button
            class="neo-button px-6 py-2 bg-blue-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 font-bold"
            onClick=${() => {
              setSuccess(false);
              onClose();
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    `;
  }

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
      >
        <button
          onClick=${onClose}
          class="absolute top-2 right-2 text-black hover:text-gray-700"
          aria-label="Close"
        >
          <i class="fas fa-times text-xl"></i>
        </button>

        <h2 class="text-2xl font-bold mb-2 text-black">Submit Your Startup</h2>
        <div class="mb-4 bg-yellow-300 p-3 border border-black rounded">
          <p class="font-bold flex items-center">
            <span class="mr-2">🚀</span> Launch Today, Get a 36+ DR Backlink
          </p>
        </div>

        ${error &&
        html`
          <div class="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded">
            <p class="text-red-700">${error}</p>
          </div>
        `}

        <form onSubmit=${handleSubmit}>
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
              onChange=${handleChange}
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
              onChange=${handleChange}
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
              onChange=${handleChange}
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
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="A short description of the startup"
            />
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
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="jack"
              required
            />
            <div class="text-sm text-gray-500 mt-2">
              We need your X username so we know the creator of the startup. If you
              don't use X and want to add your startup, please open a PR in Github.
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
            <button
              type="submit"
              class="neo-button px-4 py-2 bg-green-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold disabled:opacity-50"
              disabled=${loading}
            >
              ${loading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
};
