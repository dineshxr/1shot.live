// @ts-nocheck

// Import Preact and hooks directly from CDN
import {
  h,
  render,
} from "https://unpkg.com/preact@10.13.1/dist/preact.module.js";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "https://unpkg.com/preact@10.13.1/hooks/dist/hooks.module.js";
import htm from "https://unpkg.com/htm@3.1.1/dist/htm.module.js";

// Import components
import { Footer } from "./components/footer.js";
import { OnlineVisitors } from "./components/online-visitors.js";
import { SubmitStartupForm } from "./components/submit-startup-form.js";

// Import analytics
import { trackPageView, trackEvent, ANALYTICS_EVENTS } from './lib/analytics.js';

// Make Preact and hooks available globally for our components
window.h = h;
window.useState = useState;
window.useEffect = useEffect;
window.useRef = useRef;
window.useMemo = useMemo;
window.html = htm.bind(h);

// Track page view
if (typeof window !== 'undefined') {
  trackPageView();
}

// Featured Page Component
const FeaturedPage = () => {
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  useEffect(() => {
    document.title = "Featured Submissions | SubmitHunt";
    
    // Track page view with custom event
    trackEvent("FEATURED_PAGE_VIEW");
  }, []);

  const handleContactClick = () => {
    // Track when users click to contact for featured placement
    trackEvent("FEATURED_CONTACT_CLICK");
    
    // Open Twitter in a new tab
    window.open("https://x.com/submithunt", "_blank");
  };

  return html`
    <div class="min-h-screen flex flex-col">
      <!-- Custom Header for Featured Page -->
      <header class="bg-blue-400 text-black border-b-4 border-black">
        <div class="container max-w-6xl mx-auto px-4 py-6 md:py-8">
          <div class="flex flex-col md:flex-row justify-between items-center">
            <div class="flex items-center">
              <a href="/" class="flex items-center hover:opacity-80 transition-opacity">
                <h1 class="text-3xl md:text-4xl font-bold">💥 Submit Hunt</h1>
              </a>
              <a href="/" class="ml-4 px-3 py-1 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 font-bold text-sm">
                ← Back to Home
              </a>
            </div>
            <div
              class="mt-4 md:mt-0 flex flex-col md:flex-row items-center gap-4"
            >
              <${OnlineVisitors} />
              <button
                onClick=${() => setShowSubmitForm(true)}
                class="neo-button inline-flex items-center px-4 py-2 bg-purple-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-500 font-bold"
              >
                <i class="fas fa-plus mr-2"></i> Submit Product
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Submit Startup Form Modal -->
      <${SubmitStartupForm} isOpen=${showSubmitForm} onClose=${() => setShowSubmitForm(false)} />
      
      <main class="flex-grow">
        <!-- Hero Section -->
        <section class="bg-gradient-to-r from-blue-500 to-purple-600 text-white py-16">
          <div class="container mx-auto px-4 text-center">
            <h1 class="text-4xl md:text-5xl font-bold mb-4">Featured Product Spot</h1>
            <p class="text-xl md:text-2xl max-w-3xl mx-auto">
              Get maximum visibility for your product with premium placement on SubmitHunt
            </p>
          </div>
        </section>
        
        <!-- Featured Product Demo Section -->
        <section class="py-12 bg-gray-50">
          <div class="container mx-auto px-4">
            <div class="max-w-4xl mx-auto">
              <div class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 rounded-lg">
                <div class="flex items-center mb-4">
                  <span class="bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded mr-2">FEATURED</span>
                  <h2 class="text-2xl font-bold">Your Product Here</h2>
                </div>
                
                <div class="flex flex-col md:flex-row gap-6">
                  <div class="md:w-1/3 bg-gray-200 rounded-lg h-48 flex items-center justify-center">
                    <span class="text-gray-500 text-lg">Product Image</span>
                  </div>
                  
                  <div class="md:w-2/3">
                    <p class="text-lg mb-4">
                      This premium spot will showcase your product to all SubmitHunt visitors.
                    </p>
                    <div class="flex flex-wrap gap-2 mb-4">
                      <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Featured</span>
                      <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Premium</span>
                      <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Sponsored</span>
                    </div>
                    <a href="https://submit.gumroad.com/l/featured" target="_blank" class="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
                      Get Featured
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Benefits Section -->
        <section class="py-16 bg-white">
          <div class="container mx-auto px-4">
            <h2 class="text-3xl font-bold text-center mb-12">Why Get Featured?</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <!-- Benefit 1 -->
              <div class="text-center p-6 border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-4px] transition-transform">
                <div class="text-4xl mb-4">🎯</div>
                <h3 class="text-xl font-bold mb-2">Prominent placement on page</h3>
                <p class="text-gray-600">Your product will be displayed prominently at the top of our pages.</p>
              </div>
              
              <!-- Benefit 2 -->
              <div class="text-center p-6 border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-4px] transition-transform">
                <div class="text-4xl mb-4">👀</div>
                <h3 class="text-xl font-bold mb-2">High visibility to daily visitors</h3>
                <p class="text-gray-600">Get seen by our community of tech enthusiasts, investors, and early adopters.</p>
              </div>
              
              <!-- Benefit 3 -->
              <div class="text-center p-6 border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-4px] transition-transform">
                <div class="text-4xl mb-4">💎</div>
                <h3 class="text-xl font-bold mb-2">Professional presentation</h3>
                <p class="text-gray-600">Your product will be showcased in a professional, attention-grabbing format.</p>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Premium Spot Details -->
        <section class="py-16 bg-gray-50">
          <div class="container mx-auto px-4">
            <div class="max-w-4xl mx-auto bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 rounded-lg">
              <h2 class="text-3xl font-bold mb-6">Premium Spot</h2>
              
              <p class="text-lg mb-6">
                Top of page placement, maximum visibility. Additionally, a random featured product will be displayed on each launch page, further increasing visibility.
              </p>
              
              <div class="flex flex-col md:flex-row items-center justify-between gap-8 mb-8">
                <div class="text-center md:text-left">
                  <div class="text-4xl font-bold text-blue-600">$5</div>
                  <div class="text-gray-500">/week</div>
                </div>
                
                <a 
                  href="https://submit.gumroad.com/l/featured"
                  target="_blank"
                  class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all transform hover:scale-105 inline-block"
                >
                  Ready to get featured?
                </a>
              </div>
              
              <div class="bg-blue-50 p-4 rounded-lg">
                <p class="text-center font-medium">
                  Click the button above or <a href="https://submit.gumroad.com/l/featured" target="_blank" class="text-blue-600 hover:underline">visit our payment page</a> to get started
                </p>
              </div>
            </div>
          </div>
        </section>
        
        <!-- FAQ Section -->
        <section class="py-16 bg-white">
          <div class="container mx-auto px-4">
            <h2 class="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            
            <div class="max-w-3xl mx-auto space-y-6">
              <div class="border-2 border-black rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 class="text-xl font-bold mb-2">How long will my product be featured?</h3>
                <p class="text-gray-600">Your product will be featured for the duration of your subscription, starting at one week. You can extend this period as needed.</p>
              </div>
              
              <div class="border-2 border-black rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 class="text-xl font-bold mb-2">What information do I need to provide?</h3>
                <p class="text-gray-600">We'll need your product name, description, logo/image, website URL, and any specific call-to-action you'd like to include.</p>
              </div>
              
              <div class="border-2 border-black rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 class="text-xl font-bold mb-2">Can I see performance metrics?</h3>
                <p class="text-gray-600">Yes, we provide basic metrics including impressions, clicks, and engagement rates for your featured placement.</p>
              </div>
            </div>
          </div>
        </section>
        
        <!-- CTA Section -->
        <section class="py-16 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div class="container mx-auto px-4 text-center">
            <h2 class="text-3xl font-bold mb-6">Ready to Boost Your Product's Visibility?</h2>
            <p class="text-xl max-w-3xl mx-auto mb-8">
              Get your product in front of our engaged audience of tech enthusiasts, investors, and early adopters.
            </p>
            <a 
              href="https://submit.gumroad.com/l/featured"
              target="_blank"
              class="bg-white text-blue-600 hover:bg-gray-100 font-bold py-3 px-8 rounded-lg shadow-lg transition-all transform hover:scale-105 inline-block"
            >
              Get Featured Today
            </a>
          </div>
        </section>
      </main>
      
      <${Footer} />
    </div>
  `;
};

// Render the FeaturedPage component
render(html`<${FeaturedPage} />`, document.getElementById("app-root"));
