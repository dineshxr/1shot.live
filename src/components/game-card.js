import { trackEvent, ANALYTICS_EVENTS } from '../lib/analytics.js';
import { addReferralParam } from '../lib/url-utils.js';

export const GameCard = ({ game }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const copyGameLinkLabel = `Copy project link: Submit Hunt/#${game.slug}`;
  const [tooltipText, setTooltipText] = useState(copyGameLinkLabel);

  const handleImageError = (e) => {
    // Use data URI instead of placeholder.com
    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EGame Image%3C/text%3E%3C/svg%3E";
  };

  const handleAvatarError = (e) => {
    // Use data URI instead of placeholder.com
    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EA%3C/text%3E%3C/svg%3E";
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
    if (game.images && game.images.length > 1) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === game.images.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  const prevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (game.images && game.images.length > 1) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === 0 ? game.images.length - 1 : prevIndex - 1
      );
    }
  };

  // Get current image URL
  const getCurrentImage = () => {
    // Check if we have a screenshot URL stored in the database
    if (game.screenshot_url) {
      return game.screenshot_url;
    }
    
    // Generate a screenshot URL using Microlink API if we have a URL
    if (game.url && !game.images?.length && !game.image) {
      // If we don't have a stored screenshot and there's no cached URL, generate one
      if (!game._generatedScreenshotUrl) {
        try {
          const apiUrl = new URL('https://api.microlink.io');
          apiUrl.searchParams.append('url', game.url);
          apiUrl.searchParams.append('screenshot', 'true');
          apiUrl.searchParams.append('meta', 'false');
          apiUrl.searchParams.append('embed', 'screenshot.url');
          apiUrl.searchParams.append('waitUntil', 'networkidle2');
          
          // Cache the generated URL
          game._generatedScreenshotUrl = apiUrl.toString();
        } catch (error) {
          console.error('Error generating screenshot URL:', error);
          // If there's an error, we'll fall through to the fallback options below
        }
      }
      
      // Return the cached URL if available
      if (game._generatedScreenshotUrl) {
        return game._generatedScreenshotUrl;
      }
    }
    
    // Handle new format (images array)
    if (game.images && game.images.length > 0) {
      return game.images[currentImageIndex];
    }
    
    // Handle old format (single image property)
    if (game.image) {
      return game.image;
    }
    
    // Fallback
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EGame Image%3C/text%3E%3C/svg%3E";
  };

  // Check if we should show navigation arrows
  const hasMultipleImages = game.images && game.images.length > 1;

  const handleCopyLink = async (e) => {
    e.preventDefault();
    const copyGameLink = async () => {
      try {
        const url = `${window.location.origin}${window.location.pathname}#${game.slug}`;
        await navigator.clipboard.writeText(url);
        
        // Track link copy event
        trackEvent(ANALYTICS_EVENTS.STARTUP_LINK_COPY, {
          startupId: game.id,
          startupName: game.title,
          startupSlug: game.slug
        });
        
        setTooltipText("Link copied!");
        setTimeout(() => {
          setTooltipText(copyGameLinkLabel);
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };
    copyGameLink();
  };

  return html`
    <div
      class="game-card bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 rounded"
    >
      <a 
        href=${addReferralParam(game.url)} 
        target="_blank" 
        class="block" 
        onClick=${() => {
          trackEvent(ANALYTICS_EVENTS.STARTUP_VIEW, {
            startupId: game.id,
            startupName: game.title,
            startupUrl: game.url
          });
        }}
      >
        <div class="relative">
          <img
            src=${getCurrentImage()}
            alt=${game.title}
            class="w-full h-48 object-cover border-b-2 border-black"
            onError=${handleImageError}
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
              ${game.images.map(
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
              <h3 class="text-lg font-bold text-black">${game.title}</h3>
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
              ${game.description || ""}
            </p>
          </div>

          <div>
            <div class="mt-3 flex items-center flex-wrap min-h-[60px]">
              ${game.tags?.map(
                (tag, index) => html`
                  <span
                    key=${index}
                    class="bg-pink-300 text-black text-xs px-2 py-1 border border-black mb-1 mr-1 font-bold mb-auto"
                    >${tag}</span
                  >
                `
              )}
            </div>

            <div class="mt-3 flex items-center">
              <span class="text-xs text-gray-600 font-mono truncate">
                ${getHostname(game.url)}
              </span>
            </div>

            ${game.author &&
            html`
              <div class="mt-3 flex items-center border-t-2 border-black pt-3">
                <a
                  href=${addReferralParam(game.author.profile_url)}
                  target="_blank"
                  class="flex items-center hover:text-blue-600"
                >
                  <img
                    src=${getAvatarUrl(game.author.avatar)}
                    alt=${game.author.name}
                    class="w-6 h-6 rounded border border-black mr-2"
                    onError=${handleAvatarError}
                  />
                  <span class="text-sm font-bold">${game.author.name}</span>
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
