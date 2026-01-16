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
import { LoginModal } from "./components/login-modal.js";
import { auth } from "./lib/auth.js";

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

// Launch countdown component: matches homepage timer logic exactly
const LaunchCountdown = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  const [nextLaunchDate, setNextLaunchDate] = useState(null);
  const [isWeekend, setIsWeekend] = useState(false);

  // Calculate next launch date (weekday at 8 AM EST, skipping weekends)
  const getNextLaunchDate = () => {
    const now = new Date();
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    let nextDate = new Date(pstNow);
    
    // If it's before 8 AM today and it's a weekday, launch is today at 8 AM
    if (pstNow.getHours() < 8) {
      nextDate.setHours(8, 0, 0, 0);
      const dayOfWeek = nextDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // If today is a weekday, use today
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return nextDate;
      }
    }
    
    // Otherwise, find the next weekday at 8 AM
    nextDate.setDate(pstNow.getDate() + 1);
    nextDate.setHours(8, 0, 0, 0);
    
    // Keep incrementing until we hit a weekday
    while (true) {
      const dayOfWeek = nextDate.getDay();
      
      // If it's a weekday (Monday = 1 through Friday = 5), we found our date
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        break;
      }
      
      // Otherwise, move to next day
      nextDate.setDate(nextDate.getDate() + 1);
    }
    
    return nextDate;
  };

  // Check if we're currently in a weekend
  const checkIfWeekend = () => {
    const now = new Date();
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dayOfWeek = pstNow.getDay(); // 0 = Sunday, 6 = Saturday
    
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Calculate time remaining
  const calculateTimeLeft = () => {
    const now = new Date();
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const target = getNextLaunchDate();
    
    const difference = target.getTime() - pstNow.getTime();
    
    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    }
    
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  };

  useEffect(() => {
    // Initial calculation
    const updateCountdown = () => {
      setTimeLeft(calculateTimeLeft());
      setNextLaunchDate(getNextLaunchDate());
      setIsWeekend(checkIfWeekend());
    };
    
    updateCountdown();
    
    // Update every second
    const timer = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'America/New_York'
    });
  };

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: 'America/New_York'
    });
  };

  return html`
    <div class="border-t border-black">
      <div class="container mx-auto px-4 py-4 flex items-center gap-3 text-black">
        <span class="text-lg font-semibold">Next launch in</span>
        ${timeLeft.days > 0 ? html`<span class="inline-block rounded-md bg-black text-white px-3 py-1 font-semibold">${timeLeft.days}d</span>` : ''}
        <span class="inline-block rounded-md bg-black text-white px-3 py-1 font-semibold">${timeLeft.hours}h</span>
        <span class="inline-block rounded-md bg-black text-white px-3 py-1 font-semibold">${timeLeft.minutes}m</span>
        <span class="inline-block rounded-md bg-black text-white px-3 py-1 font-semibold">${timeLeft.seconds}s</span>
      </div>
    </div>
  `;
};

// Featured Page Component
const FeaturedPage = () => {
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    document.title = "Featured Submissions | SubmitHunt";
    
    // Track page view with custom event
    trackEvent("FEATURED_PAGE_VIEW");

    // Subscribe to auth state changes
    const unsubscribe = auth.subscribe((authState) => {
      setUser(authState.user);
      setAuthLoading(authState.loading);
    });

    // Set initial user state
    const currentAuthState = auth.getAuthState();
    setUser(currentAuthState.user);
    setAuthLoading(currentAuthState.loading);

    return unsubscribe;
  }, []);

  const handleContactClick = () => {
    // Track when users click to contact for featured placement
    trackEvent("FEATURED_CONTACT_CLICK");
    
    // Open Twitter in a new tab
    window.open("https://x.com/submithunt", "_blank");
  };

  // Handle submit button click with authentication check
  const handleSubmitClick = () => {
    if (auth.isAuthenticated()) {
      setShowSubmitForm(true);
    } else {
      setShowLoginModal(true);
    }
  };

  // Handle successful login
  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    setShowSubmitForm(true);
  };

  return html`
    <div class="min-h-screen flex flex-col">
      <!-- Custom Header for Featured Page -->
      <header class="bg-blue-400 text-black border-b-4 border-black">
        <div class="container max-w-6xl mx-auto px-4 py-6 md:py-8">
          <div class="flex flex-col md:flex-row justify-between items-center">
            <div class="flex items-center">
              <a href="/" class="flex items-center hover:opacity-80 transition-opacity">
                <div class="flex items-center">
                  <img src="/src/sh-logo.png" alt="SubmitHunt Logo" class="w-10 h-10 mr-3" />
                  <h1 class="text-3xl md:text-4xl font-bold">Submit Hunt</h1>
                </div>
              </a>
              <a href="/" class="ml-4 px-3 py-1 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 font-bold text-sm">
                ← Back to Home
              </a>
            </div>
            <div
              class="mt-4 md:mt-0 flex flex-col md:flex-row items-center gap-4"
            >
              <${OnlineVisitors} />
              <a
                href="https://submit.gumroad.com/l/featured"
                target="_blank"
                class="neo-button inline-flex items-center px-6 py-3 bg-yellow-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-500 font-bold text-lg"
              >
                <i class="fas fa-star mr-2"></i> Ready to be Featured
              </a>
            </div>
          </div>
        </div>
      </header>

      <!-- Submit Startup Form Modal -->
      <${SubmitStartupForm} isOpen=${showSubmitForm} onClose=${() => setShowSubmitForm(false)} />
      
      <!-- Login Modal -->
      <${LoginModal} 
        isOpen=${showLoginModal} 
        onClose=${() => setShowLoginModal(false)}
        onLoginSuccess=${handleLoginSuccess}
      />
      
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

        <!-- Countdown directly below hero -->
        ${LaunchCountdown()}
        
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
        
        <!-- Website Stats Section -->
        <section class="py-12 bg-white border-t border-gray-200">
          <div class="container mx-auto px-4">
            <div class="max-w-4xl mx-auto">
              <h2 class="text-2xl font-bold text-center mb-8">2026 STATISTICS ©</h2>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div class="text-center p-4 border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <div class="text-3xl font-bold text-gray-900">275,374</div>
                  <div class="text-sm text-gray-500">Visits</div>
                </div>
                <div class="text-center p-4 border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <div class="text-3xl font-bold text-gray-900">1,150,289</div>
                  <div class="text-sm text-gray-500">Page views</div>
                </div>
                <div class="text-center p-4 border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <div class="text-3xl font-bold text-gray-900">2,847</div>
                  <div class="text-sm text-gray-500">Startups</div>
                </div>
                <div class="text-center p-4 border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <div class="text-3xl font-bold text-gray-900">45,692</div>
                  <div class="text-sm text-gray-500">Upvotes</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Benefits Section -->
        <section class="py-16 bg-white">
          <div class="container mx-auto px-4">
            <h2 class="text-3xl font-bold text-center mb-12">Why Get Featured?</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
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
              
              <!-- Benefit 4 - Skip Queue -->
              <div class="text-center p-6 border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-4px] transition-transform bg-yellow-50">
                <div class="text-4xl mb-4">⚡</div>
                <h3 class="text-xl font-bold mb-2">Skip the waitlist queue</h3>
                <p class="text-gray-600">Launch immediately without waiting in the standard submission queue.</p>
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
              
              <!-- Features List -->
              <div class="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 mb-6">
                <h3 class="text-xl font-bold mb-4 text-yellow-800">✨ Featured Benefits Include:</h3>
                <ul class="space-y-2 text-gray-700">
                  <li class="flex items-center"><i class="fas fa-check text-green-500 mr-2"></i> <strong>Skip the waitlist queue</strong> - Launch immediately</li>
                  <li class="flex items-center"><i class="fas fa-check text-green-500 mr-2"></i> Premium placement at top of homepage</li>
                  <li class="flex items-center"><i class="fas fa-check text-green-500 mr-2"></i> Guaranteed high authority backlink</li>
                  <li class="flex items-center"><i class="fas fa-check text-green-500 mr-2"></i> Featured in our startup newsletter</li>
                  <li class="flex items-center"><i class="fas fa-check text-green-500 mr-2"></i> Maximum visibility to daily visitors</li>
                </ul>
              </div>
              
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
