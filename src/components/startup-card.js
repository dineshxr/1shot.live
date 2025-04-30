// Import analytics utilities
import { trackEvent, ANALYTICS_EVENTS } from '../lib/analytics.js';

export const StartupCard = ({ startup }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const copyStartupLinkLabel = `Copy project link: Submit Hunt/#${startup.slug}`;
  const [tooltipText, setTooltipText] = useState(copyStartupLinkLabel);

  const handleImageError = (e) => {
    e.target.src = undefined;
  };

  const handleAvatarError = (e) => {
    e.target.src = undefined;
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
    // Handle new format (images array)
    if (startup.images && startup.images.length > 0) {
      return startup.images[currentImageIndex];
    }
    // Handle old format (single image property)
    if (startup.image) {
      return startup.image;
    }
    // Fallback
    return "https://via.placeholder.com/400x225?text=Startup+Image";
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

  return html`
    <div
      class="startup-card bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 rounded"
    >
      <a 
        href=${startup.url} 
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
            alt=${startup.title}
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

            <div class="mt-3 flex items-center">
              <span class="text-xs text-gray-600 font-mono truncate">
                ${getHostname(startup.url)}
              </span>
            </div>

            ${startup.author &&
            html`
              <div class="mt-3 flex items-center border-t-2 border-black pt-3">
                <a
                  href=${startup.author.profile_url}
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
