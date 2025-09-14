// Import analytics functions and constants
import { trackEvent, ANALYTICS_EVENTS } from '../lib/analytics.js';
import { addReferralParam } from '../lib/url-utils.js';
import { UpvoteButton } from './upvote-button.js';
import { RankingBadge } from './ranking-badge.js';

export const StartupCard = ({ startup, user, onUpvoteChange }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const copyStartupLinkLabel = `Copy project link: Submit Hunt/#${startup.slug}`;
  const [tooltipText, setTooltipText] = useState(copyStartupLinkLabel);

  const handleImageError = (e) => {
    // Use data URI instead of placeholder.com
    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EStartup Image%3C/text%3E%3C/svg%3E";
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
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3EStartup Image%3C/text%3E%3C/svg%3E";
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
    shareText += `\n\nEarning free DR 37+ backlink on submithunt`;
    
    // Add creator tag if available
    if (startup.author && startup.author.name) {
      shareText += ` @${startup.author.name.replace('@', '')}`;
    }
    
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

  // Create internal link to startup detail page using slug
  const getInternalDetailUrl = () => {
    return `/startup/${startup.slug}`;
  };
  
  return html`
    <div class="startup-card bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all duration-200">
      <div class="flex items-start gap-4">
        <!-- Logo -->
        <div class="flex-shrink-0">
          <div class="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
            <img
              src=${startup.logo || getCurrentImage()}
              alt=${`${startup.title} logo`}
              class="w-full h-full object-cover"
              onError=${(e) => {
                e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='20' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3E${startup.title?.charAt(0) || 'S'}%3C/text%3E%3C/svg%3E";
              }}
            />
          </div>
        </div>
        
        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <a 
                href=${getInternalDetailUrl()} 
                class="block group" 
                onClick=${(e) => {
                  e.preventDefault();
                  trackEvent(ANALYTICS_EVENTS.LINK_CLICK, {
                    startupId: startup.id,
                    startupName: startup.title,
                    startupUrl: getInternalDetailUrl()
                  });
                  window.history.pushState({}, "", getInternalDetailUrl());
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
              >
                <h3 class="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
                  ${startup.title}
                </h3>
              </a>
              
              <div class="flex items-center text-sm text-gray-600 mb-2">
                <span>by ${startup.author?.name || 'Anonymous'}</span>
              </div>
              
              <p class="text-sm text-gray-700 leading-relaxed">
                ${startup.description || ''}
              </p>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center gap-2 ml-4">
              ${UpvoteButton({ startup, user, onUpvoteChange })}
              
              <button
                onClick=${(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Track external link click
                  trackEvent(ANALYTICS_EVENTS.STARTUP_VIEW, {
                    startupId: startup.id,
                    startupName: startup.title,
                    startupUrl: startup.url
                  });
                  
                  // Open startup URL in new tab
                  window.open(addReferralParam(startup.url), '_blank', 'noopener,noreferrer');
                }}
                class="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
                aria-label="Visit startup"
              >
                <i class="fas fa-external-link-alt text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Featured Badge -->
      ${startup.featured && html`
        <div class="mt-4 pt-4 border-t border-gray-100">
          <span class="inline-block bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
            Featured
          </span>
        </div>
      `}
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
