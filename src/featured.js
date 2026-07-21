// @ts-nocheck

// Import Preact and hooks directly from CDN
import {
  h,
  render,
} from "/vendor/preact.module.js";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "/vendor/preact-hooks.module.js";
import htm from "/vendor/htm.module.js";

// Import components
import { Footer } from "./components/footer.js";
import { DrComparison } from "./components/dr-comparison.js";
import { OnlineVisitors } from "./components/online-visitors.js";
import { LoginModal } from "./components/login-modal.js";
import { LaunchCountdown } from "./components/launch-countdown.js";
import { auth } from "./lib/auth.js";

// Import analytics
import { trackPageView, trackEvent } from './lib/events.js';

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
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    document.title = "Featured Submissions | SubmitHunt";

    trackEvent("FEATURED_PAGE_VIEW");

    const unsubscribe = auth.subscribe((authState) => {
      setUser(authState.user);
      setAuthLoading(authState.loading);
    });

    const currentAuthState = auth.getAuthState();
    setUser(currentAuthState.user);
    setAuthLoading(currentAuthState.loading);

    return unsubscribe;
  }, []);

  // Route users to /submit?plan=featured — the canonical paid flow with Stripe Checkout.
  const goToFeaturedSubmit = () => {
    if (auth.isAuthenticated()) {
      window.location.href = '/submit?plan=featured';
    } else {
      setShowLoginModal(true);
    }
  };

  const handleContactClick = () => {
    trackEvent("FEATURED_CONTACT_CLICK");
    goToFeaturedSubmit();
  };

  const handleSubmitClick = goToFeaturedSubmit;

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    window.location.href = '/submit?plan=featured';
  };

  return html`
    <div class="min-h-screen flex flex-col" style="background-color: var(--sh-bg);">
      <!-- Header -->
      <header class="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex h-16 items-center justify-between gap-4">
            <a href="/" class="flex items-center gap-2">
              <img src="/src/sh-logo.png" alt="SubmitHunt" class="w-8 h-8 rounded-md" />
              <span class="text-base font-semibold tracking-tight text-gray-900">SubmitHunt</span>
            </a>
            <nav class="hidden md:flex items-center gap-1 text-sm">
              <a href="/" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100">Discover</a>
              <a href="/blog" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100">Blog</a>
              <a href="/pricing" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100">Pricing</a>
              <a href="/featured" class="px-3 py-1.5 rounded-lg text-gray-900 bg-gray-100">Featured</a>
            </nav>
            <div class="flex items-center gap-2">
              <div class="hidden lg:block"><${OnlineVisitors} /></div>
              <button onClick=${handleContactClick} class="sh-btn-accent">
                <i class="fas fa-star text-xs"></i><span>Get Featured</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Login Modal -->
      <${LoginModal}
        isOpen=${showLoginModal}
        onClose=${() => setShowLoginModal(false)}
        onLoginSuccess=${handleLoginSuccess}
      />

      <main class="flex-1">
        <!-- Hero Section -->
        <section class="py-16 sm:py-20 border-b border-gray-200 bg-white">
          <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 mb-5">
              <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              Featured placement
            </span>
            <h1 class="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 mb-4">
              Get maximum visibility for your product
            </h1>
            <p class="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Premium placement at the top of SubmitHunt — seen by every visitor, every day.
            </p>
            <div class="flex flex-wrap items-center justify-center gap-3">
              <button onClick=${handleSubmitClick} class="sh-btn-accent">
                <i class="fas fa-star text-xs"></i> Get featured — $50
              </button>
              <a href="/pricing" class="sh-btn-ghost">
                View all plans
              </a>
            </div>
          </div>
        </section>

        <!-- Countdown -->
        <section class="py-8 border-b border-gray-200">
          <div class="max-w-3xl mx-auto px-4">
            ${LaunchCountdown()}
          </div>
        </section>

        <!-- Featured Product Demo -->
        <section class="py-12 sm:py-16">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-8">
              <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-2">
                Here's what a featured card looks like
              </h2>
              <p class="text-gray-500 text-sm">A premium spot in the main feed, with subtle gradient border.</p>
            </div>

            <div class="sh-card startup-card startup-card-featured p-6">
              <div class="flex items-start gap-4">
                <div class="w-14 h-14 rounded-xl ring-1 ring-gray-200 bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center shrink-0">
                  <i class="fas fa-star text-orange-600 text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 class="text-base font-semibold text-gray-900">Your product here</h3>
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      Featured
                    </span>
                  </div>
                  <p class="text-sm text-gray-600 leading-relaxed mb-2">
                    This premium spot showcases your product to every SubmitHunt visitor.
                  </p>
                  <div class="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <span>by you</span>
                    <span class="text-gray-300">·</span>
                    <span class="inline-flex items-center px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-[11px] font-medium">
                      Your category
                    </span>
                  </div>
                </div>
                <button onClick=${handleSubmitClick} class="sh-btn-primary text-xs shrink-0">
                  Get featured
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Website Stats Section -->
        <section class="py-12 sm:py-14">
          <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-8">
              <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">2026 Statistics</span>
              <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mt-2">An engaged audience, every day</h2>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 text-center">
                <div class="text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">275,374</div>
                <div class="text-xs text-gray-500 mt-1">Visits</div>
              </div>
              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 text-center">
                <div class="text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">1,150,289</div>
                <div class="text-xs text-gray-500 mt-1">Page views</div>
              </div>
              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 text-center">
                <div class="text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">2,847</div>
                <div class="text-xs text-gray-500 mt-1">Startups</div>
              </div>
              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 text-center">
                <div class="text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">45,692</div>
                <div class="text-xs text-gray-500 mt-1">Upvotes</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Benefits Section -->
        <section class="py-12 sm:py-16">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-3">Why get featured?</h2>
              <p class="text-gray-500">Premium placement, more eyes, faster launch.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                <div class="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg mb-4">🎯</div>
                <h3 class="text-sm font-semibold text-gray-900 mb-1.5">Prominent placement</h3>
                <p class="text-sm text-gray-500 leading-relaxed">Your product sits at the top of our feed, with a subtle gradient border that draws the eye.</p>
              </div>

              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                <div class="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg mb-4">👀</div>
                <h3 class="text-sm font-semibold text-gray-900 mb-1.5">High daily visibility</h3>
                <p class="text-sm text-gray-500 leading-relaxed">Get seen by our community of indie hackers, investors, and early adopters.</p>
              </div>

              <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                <div class="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg mb-4">💎</div>
                <h3 class="text-sm font-semibold text-gray-900 mb-1.5">Professional presentation</h3>
                <p class="text-sm text-gray-500 leading-relaxed">Showcased in a polished, attention-grabbing card layout.</p>
              </div>

              <div class="bg-orange-50/60 border border-orange-200 rounded-2xl shadow-sm p-6">
                <div class="w-10 h-10 rounded-xl bg-white border border-orange-200 flex items-center justify-center text-lg mb-4">⚡</div>
                <h3 class="text-sm font-semibold text-gray-900 mb-1.5">Skip the waitlist</h3>
                <p class="text-sm text-gray-700 leading-relaxed">Launch immediately — no need to wait in the standard submission queue.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Premium Spot Details -->
        <section class="py-12 sm:py-16">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 md:p-10">
              <div class="flex items-start gap-3 mb-6">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                  Premium spot
                </span>
              </div>

              <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-3">Top placement, maximum visibility</h2>
              <p class="text-gray-600 mb-8 leading-relaxed">
                A featured product is randomly displayed on every launch page in addition to the top of homepage — your reach compounds across the site.
              </p>

              <div class="bg-orange-50/60 border border-orange-200 rounded-2xl p-6 mb-8">
                <h3 class="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i class="fas fa-sparkles text-orange-600 text-xs"></i> Featured benefits
                </h3>
                <ul class="space-y-2.5 text-sm text-gray-700">
                  <li class="flex items-start gap-2.5">
                    <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                    <span><strong class="text-gray-900">Skip the waitlist queue</strong> — launch immediately</span>
                  </li>
                  <li class="flex items-start gap-2.5">
                    <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                    <span>Premium placement at the top of homepage</span>
                  </li>
                  <li class="flex items-start gap-2.5">
                    <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                    <span>Guaranteed high-authority backlink (37+ DR)</span>
                  </li>
                  <li class="flex items-start gap-2.5">
                    <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                    <span>Featured in our startup newsletter</span>
                  </li>
                  <li class="flex items-start gap-2.5">
                    <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                    <span>Maximum visibility to daily visitors</span>
                  </li>
                </ul>
              </div>

              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-6 border-t border-gray-200">
                <div>
                  <div class="flex items-baseline gap-1">
                    <span class="text-3xl font-semibold tracking-tight text-gray-900">$50</span>
                    <span class="text-sm text-gray-500">/ week</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-1">One-time payment · no subscription</p>
                </div>
                <button onClick=${handleSubmitClick} class="sh-btn-accent">
                  Get featured <i class="fas fa-arrow-right text-xs"></i>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- DR before/after -->
        <${DrComparison} />

        <!-- FAQ Section -->
        <section class="py-12 sm:py-16">
          <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-center text-gray-900 mb-3">Frequently asked questions</h2>
            <p class="text-center text-gray-500 mb-10 text-sm">Anything else? Ping us on X.</p>

            <div class="space-y-3">
              <details class="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <summary class="flex items-center justify-between cursor-pointer px-6 py-5 list-none">
                  <h3 class="font-medium text-gray-900">How long will my product be featured?</h3>
                  <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                <div class="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                  Your product will be featured for the duration of your subscription, starting at one week. You can extend the period any time.
                </div>
              </details>

              <details class="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <summary class="flex items-center justify-between cursor-pointer px-6 py-5 list-none">
                  <h3 class="font-medium text-gray-900">What information do I need to provide?</h3>
                  <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                <div class="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                  Product name, description, logo/image, website URL, and any specific call-to-action you'd like to include.
                </div>
              </details>

              <details class="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <summary class="flex items-center justify-between cursor-pointer px-6 py-5 list-none">
                  <h3 class="font-medium text-gray-900">Can I see performance metrics?</h3>
                  <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                <div class="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                  Yes — we provide basic metrics including impressions, clicks, and engagement rates for your featured placement.
                </div>
              </details>
            </div>
          </div>
        </section>

        <!-- CTA Section -->
        <section class="py-14 sm:py-20 border-t border-gray-200 bg-white">
          <div class="max-w-3xl mx-auto px-4 text-center">
            <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-3">
              Ready to boost your product's visibility?
            </h2>
            <p class="text-gray-500 max-w-2xl mx-auto mb-8">
              Get your product in front of an engaged audience of indie founders, investors, and early adopters.
            </p>
            <button onClick=${handleSubmitClick} class="sh-btn-accent">
              <i class="fas fa-star text-xs"></i> Get featured today
            </button>
          </div>
        </section>
      </main>

      <${Footer} />
    </div>
  `;
};

render(html`<${FeaturedPage} />`, document.getElementById("app-root"));
