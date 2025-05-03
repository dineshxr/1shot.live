// Using global analytics functions defined in main.js instead of imports
// Note: useEffect is already defined globally in main.js

export const StartupModal = ({ startup, onClose }) => {
  // Track modal view when opened
  useEffect(() => {
    // Track analytics event
    trackEvent(ANALYTICS_EVENTS.LINK_CLICK, {
      type: 'modal_view',
      startupId: startup.id,
      startupName: startup.title
    });
    
    // Update page title for SEO when modal is opened
    const originalTitle = document.title;
    document.title = `${startup.title} - Submit Hunt | ${startup.description?.substring(0, 50)}...`;
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    const originalDescription = metaDescription?.getAttribute('content');
    if (metaDescription) {
      metaDescription.setAttribute('content', `${startup.description?.substring(0, 155)}`);
    }
    
    // Update canonical URL to include the startup slug
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const originalCanonical = canonicalLink?.getAttribute('href');
    if (canonicalLink && startup.slug) {
      canonicalLink.setAttribute('href', `https://submit-hunt.com/#${startup.slug}`);
    }
    
    // Add structured data for this specific startup
    addStartupStructuredData(startup);
    
    // Cleanup function to restore original values when modal is closed
    return () => {
      document.title = originalTitle;
      if (metaDescription && originalDescription) {
        metaDescription.setAttribute('content', originalDescription);
      }
      if (canonicalLink && originalCanonical) {
        canonicalLink.setAttribute('href', originalCanonical);
      }
      removeStartupStructuredData();
    };
  }, [startup]);
  
  // Function to add structured data for the current startup
  const addStartupStructuredData = (startup) => {
    // Remove any existing startup structured data
    removeStartupStructuredData();
    
    // Create new structured data script element
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'startup-structured-data';
    
    // Helper function to get the best available image for a startup
    function getStartupImage(startup) {
      // Generate a screenshot URL using Microlink API
      if (startup.url) {
        const apiUrl = new URL('https://api.microlink.io');
        apiUrl.searchParams.append('url', startup.url);
        apiUrl.searchParams.append('screenshot', 'true');
        apiUrl.searchParams.append('meta', 'false');
        apiUrl.searchParams.append('embed', 'screenshot.url');
        apiUrl.searchParams.append('waitUntil', 'networkidle2');
        return apiUrl.toString();
      }
      
      // Use images array if available
      if (startup.images && startup.images.length > 0) {
        return startup.images[0];
      }
      
      // Use single image property if available
      if (startup.image) {
        return startup.image;
      }
      
      // Fallback
      return "https://via.placeholder.com/400x225?text=Startup+Image";
    }
    
    // Generate structured data for this startup
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: startup.title,
      description: startup.description,
      url: `https://submit-hunt.com/#${startup.slug}`,
      image: getStartupImage(startup),
      brand: {
        '@type': 'Brand',
        name: startup.title
      },
      offers: {
        '@type': 'Offer',
        url: startup.url,
        availability: 'https://schema.org/OnlineOnly'
      },
      category: startup.tags?.join(', ')
    };
    
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);
  };
  
  // Function to remove startup structured data
  const removeStartupStructuredData = () => {
    const existingScript = document.getElementById('startup-structured-data');
    if (existingScript) {
      existingScript.remove();
    }
  };

  return html`
    <div
      class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
      onClick=${(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        class="max-w-lg bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 w-full max-w-2xl rounded relative mx-4"
      >
        <button
          onClick=${onClose}
          class="absolute top-2 right-2 text-black hover:text-gray-700"
          aria-label="Close"
        >
          <i class="fas fa-times text-xl"></i>
        </button>

        <div class="space-y-4">
          <h2 class="text-2xl font-bold text-black">${startup.title}</h2>

          <div
            class="aspect-video w-full overflow-hidden border-6 border-black rounded"
          >
            <img
              src=${startup.images?.[0]}
              alt=${startup.title}
              class="w-full h-full object-cover"
            />
          </div>

          <p class="text-black">${startup.description}</p>

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
          
          <div
            class="flex items-center justify-between pt-4 border-t-2 border-black"
          >
            <a
              href=${startup.author.profile_url}
              target="_blank"
              class="flex items-center hover:text-blue-600"
            >
              <img
                src=${startup.author.avatar}
                alt=${startup.author.name}
                class="w-6 h-6 rounded border border-black mr-2"
              />
              <span class="text-sm font-bold">${startup.author.name}</span>
            </a>

            <a
              href=${startup.url}
              target="_blank"
              class="neo-button px-4 py-2 bg-green-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold"
            >
              Play Game
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
};
