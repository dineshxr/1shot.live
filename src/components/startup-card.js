// Import analytics functions and constants
import { trackEvent, ANALYTICS_EVENTS } from '../lib/analytics.js';
import { addReferralParam } from '../lib/url-utils.js';

export const StartupCard = ({ startup }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const copyStartupLinkLabel = `Copy project link: Submit Hunt/#${startup.slug}`;
  const [tooltipText, setTooltipText] = useState(copyStartupLinkLabel);

  const handleImageError = (e) => {
    e.target.src = "/placeholder-startup.png";
  };

  const handleAvatarError = (e) => {
    e.target.src = "/placeholder-avatar.png";
  };

  // Ensure avatar URL has proper protocol
  const getAvatarUrl = (url) => {
    if (!url) return undefined;

    // Check if URL already has a protocol
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    // Add https:// protocol if missing
    return `https://${url}`;
  };

  // Handle navigation between images
  const nextImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (startup.images && startup.images.length > 1) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === startup.images.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  const prevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (startup.images && startup.images.length > 1) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === 0 ? startup.images.length - 1 : prevIndex - 1
      );
    }
  };

  // Get current image URL
  const getCurrentImage = () => {
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
    return "/placeholder-startup.png";
  };

  // Check if we should show navigation arrows
  const hasMultipleImages = startup.images && startup.images.length > 1;

  const handleCopyLink = async (e) => {
    e.preventDefault();
    const copyStartupLink = async () => {
      try {
        const url = `${window.location.origin}${window.location.pathname}#${startup.slug}`;
        await navigator.clipboard.writeText(url);
        
        // Track link copy event
        trackEvent(ANALYTICS_EVENTS.LINK_CLICK, {
          startupId: startup.id,
          startupName: startup.title,
          startupSlug: startup.slug
        });
        
        setTooltipText("Link copied!");
        setTimeout(() => {
          setTooltipText(copyStartupLinkLabel);
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };
    copyStartupLink();
  };

  const handleShareOnX = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = `${window.location.origin}${window.location.pathname}#${startup.slug}`;
    
    // Create a more detailed share text
    let shareText = `Check out ${startup.title} on Submithunt`;
    
    // Add description if available
    if (startup.description) {
      shareText += `: ${startup.description.substring(0, 80)}`;
      if (startup.description.length > 80) shareText += '...';
    }
    
    // Add the free backlink message
    shareText += `\n\nEarning free DR 36+ backlink on submithunt`;
    
    // Add tags if available
    if (startup.tags && startup.tags.length > 0) {
      // Add up to 3 tags as hashtags
      const hashtags = startup.tags.slice(0, 3).map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
      shareText += `\n\n${hashtags}`;
    }
    
    // Track share event with detailed properties
    trackEvent(ANALYTICS_EVENTS.SHARE_CLICK, {
      startupId: startup.id,
      startupName: startup.title,
      platform: 'X',
      startupSlug: startup.slug,
      startupUrl: startup.url,
      startupTags: startup.tags?.join(',') || '',
      shareText: shareText.substring(0, 50) + '...' // Log truncated version for analytics
    });
    
    // Open X share dialog with the detailed text
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=550,height=420');
  };

  return html`
    <div
      class="startup-card bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 rounded"
    >
      <a 
        href=${addReferralParam(startup.url)} 
        target="_blank" 
        class="block" 
        onClick=${() => {
          trackEvent(ANALYTICS_EVENTS.LINK_CLICK, {
            startupId: startup.id,
            startupName: startup.title,
            startupUrl: startup.url
          });
        }}
      >
        <div class="relative">
          <img
            src=${getCurrentImage()}
            alt=${`Screenshot of ${startup.title} - ${startup.description?.substring(0, 50) || 'Innovative startup'}`}
            class="w-full h-48 object-cover border-b-2 border-black"
            onError=${handleImageError}
            loading="lazy"
            width="400"
            height="225"
          />
          ${hasMultipleImages &&
          html`
            <div
              class="absolute inset-0 flex justify-between items-center pointer-events-none"
            >
              <button
                onClick=${prevImage}
                class="ml-2 w-8 h-8 flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 pointer-events-auto"
                aria-label="Previous image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path
                    fill-rule="evenodd"
                    d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
                  />
                </svg>
              </button>
              <button
                onClick=${nextImage}
                class="mr-2 w-8 h-8 flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 pointer-events-auto"
                aria-label="Next image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                  />
                </svg>
              </button>
            </div>
            <div
              class="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none"
            >
              ${startup.images.map(
                (_, index) => html`
                  <div
                    key=${index}
                    class="w-2 h-2 mx-1 rounded-full ${index ===
                    currentImageIndex
                      ? "bg-white border border-black"
                      : "bg-gray-400"}"
                  ></div>
                `
              )}
            </div>
          `}
        </div>
        <div class="p-4">
          <div class="min-h-[70px]">
            <div class="flex items-center gap-1">
              <h3 class="text-lg font-bold text-black">${startup.title}</h3>
              <button
                onClick=${handleCopyLink}
                class="group relative p-1 hover:bg-gray-100 rounded"
                aria-label="Copy startup link"
              >
                <i class="fas fa-link text-sm"></i>
                <div
                  class="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap"
                >
                  ${tooltipText
                    .split(":")
                    .map(
                      (line, index) =>
                        html`<span class="block"
                          >${line}${index < tooltipText.split(":").length - 1
                            ? ":"
                            : ""}</span
                        >`
                    )}
                </div>
              </button>
            </div>
            <p class="text-black mt-1 text-sm line-clamp-2">
              ${startup.description || ""}
            </p>
          </div>

          <div>
            <div class="mt-3 flex items-center flex-wrap min-h-[60px]">
              ${startup.tags?.map(
                (tag, index) => html`
                  <span
                    key=${index}
                    class="bg-pink-300 text-black text-xs px-2 py-1 border border-black mb-1 mr-1 font-bold mb-auto"
                    >${tag}</span
                  >
                `
              )}
            </div>

            <div class="mt-3 flex items-center justify-between">
              <span class="text-xs text-gray-600 font-mono truncate">
                ${getHostname(startup.url)}
              </span>
              <button
                onClick=${handleShareOnX}
                class="group relative p-1 hover:bg-gray-100 rounded flex items-center"
                aria-label="Share on X"
              >
                <i class="fab fa-x-twitter text-sm mr-1"></i>
                <span class="text-xs">Share</span>
                <div
                  class="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap"
                >
                  Share on X
                </div>
              </button>
            </div>

            ${startup.author &&
            html`
              <div class="mt-3 flex items-center border-t-2 border-black pt-3">
                <a
                  href=${addReferralParam(startup.author.profile_url)}
                  target="_blank"
                  class="flex items-center hover:text-blue-600"
                >
                  <img
                    src=${getAvatarUrl(startup.author.avatar)}
                    alt=${startup.author.name}
                    class="w-6 h-6 rounded border border-black mr-2"
                    onError=${handleAvatarError}
                  />
                  <span class="text-sm font-bold">${startup.author.name}</span>
                </a>
              </div>
            `}
          </div>
        </div>
      </a>
    </div>
  `;
};

function getHostname(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
