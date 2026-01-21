// Import Supabase client
import { supabaseClient } from '../lib/supabase-client.js';
import { addReferralParam } from '../lib/url-utils.js';
import { trackEvent, ANALYTICS_EVENTS } from '../lib/analytics.js';

export const StartupDetailPage = () => {
  const [startup, setStartup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const fetchStartupDetails = async () => {
      setLoading(true);
      
      try {
        // Get the slug from the URL path
        const pathSegments = window.location.pathname.split('/');
        const slug = pathSegments[pathSegments.length - 1];
        
        console.log('StartupDetailPage: Current pathname:', window.location.pathname);
        console.log('StartupDetailPage: Path segments:', pathSegments);
        console.log('StartupDetailPage: Extracted slug:', slug);
        
        if (!slug) {
          throw new Error('No startup slug found in URL');
        }
        
        const supabase = supabaseClient();
        const { data, error } = await supabase
          .from('startups')
          .select('*')
          .eq('slug', decodeURIComponent(slug))
          .limit(1);
          
        const startup = data && data.length > 0 ? data[0] : null;
          
        if (error) throw error;
        if (!startup) throw new Error('Startup not found');
        
        setStartup(startup);
      } catch (err) {
        console.error('Error fetching startup details:', err);
        setError(err.message || 'Failed to load startup details');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStartupDetails();
  }, []);
  
  const handleImageError = (e) => {
    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EStartup Image%3C/text%3E%3C/svg%3E";
  };

  const handleAvatarError = (e) => {
    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EA%3C/text%3E%3C/svg%3E";
  };

  // Ensure avatar URL has proper protocol
  const getAvatarUrl = (url) => {
    if (!url) return undefined;
    return url.startsWith("http") ? url : `https://${url}`;
  };
  
  // Handle navigation between images
  const nextImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (startup?.images && startup.images.length > 1) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === startup.images.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  const prevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (startup?.images && startup.images.length > 1) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === 0 ? startup.images.length - 1 : prevIndex - 1
      );
    }
  };
  
  // Get current image URL
  const getCurrentImage = () => {
    if (!startup) return "";
    
    // Generate a screenshot URL using Microlink API
    if (startup.url) {
      // Check if we already have a screenshot URL stored in the database
      if (startup.screenshot_url) {
        return startup.screenshot_url;
      }
      
      // If we don't have a stored screenshot and there's no cached URL, generate one
      if (!startup._generatedScreenshotUrl) {
        try {
          const apiUrl = new URL('https://api.microlink.io');
          apiUrl.searchParams.append('url', startup.url);
          apiUrl.searchParams.append('screenshot', 'true');
          apiUrl.searchParams.append('meta', 'false');
          apiUrl.searchParams.append('embed', 'screenshot.url');
          apiUrl.searchParams.append('waitUntil', 'networkidle2');
          
          // Cache the generated URL
          startup._generatedScreenshotUrl = apiUrl.toString();
        } catch (error) {
          console.error('Error generating screenshot URL:', error);
          // If there's an error, we'll fall through to the fallback options below
        }
      }
      
      // Return the cached URL if available
      if (startup._generatedScreenshotUrl) {
        return startup._generatedScreenshotUrl;
      }
    }
    
    // Handle new format (images array)
    if (startup.images && startup.images.length > 0) {
      return startup.images[currentImageIndex];
    }
    
    // Handle old format (single image property)
    if (startup.image) {
      return startup.image;
    }
    
    // Fallback
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EStartup Image%3C/text%3E%3C/svg%3E";
  };
  
  function getHostname(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  
  const handleVisitWebsite = () => {
    if (startup?.url) {
      trackEvent(ANALYTICS_EVENTS.LINK_CLICK, {
        startupId: startup.id,
        startupName: startup.title,
        startupUrl: startup.url
      });
      window.open(addReferralParam(startup.url), '_blank');
    }
  };
  
  // Check if we should show navigation arrows
  const hasMultipleImages = startup?.images && startup.images.length > 1;
  
  if (loading) {
    return html`
      <div class="container mx-auto px-4 py-8 max-w-6xl">
        <div class="flex justify-center items-center h-64">
          <p class="text-xl">Loading startup details...</p>
        </div>
      </div>
    `;
  }
  
  if (error || !startup) {
    return html`
      <div class="container mx-auto px-4 py-8 max-w-6xl">
        <div class="flex flex-col justify-center items-center h-64">
          <p class="text-xl text-red-500 mb-4">
            ${error || 'Startup not found'}
          </p>
          <a href="/" class="bg-black text-white px-6 py-3 rounded font-bold hover:bg-gray-800">
            Back to Home
          </a>
        </div>
      </div>
    `;
  }
  
  return html`
    <div class="container mx-auto px-4 py-8 max-w-6xl">
      <div class="mb-6">
        <a href="/" class="text-blue-600 hover:underline flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" class="mr-1">
            <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
          Back to all startups
        </a>
      </div>
      
      <div class="bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded">
        <div class="relative">
          <img
            src=${getCurrentImage()}
            alt=${`Screenshot of ${startup.title} - ${startup.description?.substring(0, 50) || 'Innovative startup'}`}
            class="w-full h-64 md:h-96 object-cover border-b-2 border-black"
            onError=${handleImageError}
            loading="lazy"
          />
          ${hasMultipleImages &&
          html`
            <div class="absolute inset-0 flex justify-between items-center pointer-events-none">
              <button
                onClick=${prevImage}
                class="ml-2 w-8 h-8 flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 pointer-events-auto"
                aria-label="Previous image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
                </svg>
              </button>
              <button
                onClick=${nextImage}
                class="mr-2 w-8 h-8 flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 pointer-events-auto"
                aria-label="Next image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </button>
            </div>
            <div class="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
              ${startup.images.map(
                (_, index) => html`
                  <div
                    key=${index}
                    class="w-2 h-2 mx-1 rounded-full ${index === currentImageIndex
                      ? "bg-white border border-black"
                      : "bg-gray-400"}"
                  ></div>
                `
              )}
            </div>
          `}
        </div>
        
        <div class="p-6">
          <h1 class="text-3xl font-bold mb-2">${startup.title}</h1>
          <p class="text-lg mb-6">${startup.description || ""}</p>
          
          <div class="mb-6">
            <h2 class="text-xl font-bold mb-2">Tags</h2>
            <div class="flex flex-wrap">
              ${startup.tags?.map(
                (tag, index) => html`
                  <span
                    key=${index}
                    class="bg-pink-300 text-black text-sm px-3 py-1 border border-black mb-2 mr-2 font-bold"
                  >${tag}</span>
                `
              )}
            </div>
          </div>
          
          <div class="mb-6">
            <h2 class="text-xl font-bold mb-2">Website</h2>
            <p class="text-lg mb-2">${getHostname(startup.url)}</p>
            <button
              onClick=${handleVisitWebsite}
              class="bg-black text-white px-6 py-3 rounded font-bold hover:bg-gray-800 transition-colors"
            >
              Visit Website
            </button>
          </div>
          
          ${startup.author &&
          html`
            <div class="border-t-2 border-black pt-4 mt-6">
              <h2 class="text-xl font-bold mb-2">Created by</h2>
              <a
                href=${addReferralParam(startup.author.profile_url || `https://twitter.com/${startup.author}`)}
                target="_blank"
                class="flex items-center hover:text-blue-600"
              >
                <img
                  src=${getAvatarUrl(startup.author.avatar || `https://unavatar.io/twitter/${startup.author}`)}
                  alt=${startup.author.name || (startup.author || 'User')}
                  class="w-10 h-10 rounded-full border border-black mr-3"
                  onError=${handleAvatarError}
                />
                <span class="text-lg font-bold">${startup.author.name || `@${startup.author || 'user'}`}</span>
              </a>
            </div>
          `}
          
        </div>
      </div>
    </div>
  `;
};
