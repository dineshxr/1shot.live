import { html } from 'htm/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { auth } from './lib/auth.js';
import { Footer } from './components/footer.js';

// Make hooks available globally
window.useState = useState;
window.useEffect = useEffect;
window.html = html;

const PricingPage = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.subscribe((authState) => {
      setUser(authState.user);
    });

    const currentAuthState = auth.getAuthState();
    setUser(currentAuthState.user);

    return unsubscribe;
  }, []);

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
              <a href="/pricing" class="px-3 py-1.5 rounded-lg text-gray-900 bg-gray-100">Pricing</a>
              <a href="/featured" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100">Featured</a>
            </nav>
            <div class="flex items-center gap-2">
              <a href="/submit" class="sh-btn-primary">
                <i class="fas fa-plus text-xs"></i><span>Submit</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div class="max-w-6xl mx-auto">
          <!-- Page Header -->
          <div class="text-center mb-12 sm:mb-16">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 mb-5">
              <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              Pricing
            </span>
            <h1 class="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 mb-4">
              Simple, transparent pricing
            </h1>
            <p class="text-lg text-gray-500 max-w-2xl mx-auto">
              Choose the plan that fits your launch. Every plan comes with a high-authority dofollow backlink.
            </p>
          </div>

          <!-- Pricing Cards -->
          <div class="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">

            <!-- Free Plan -->
            <div class="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm flex flex-col">
              <div class="mb-6">
                <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Standard Launch</h3>
                <div class="flex items-baseline gap-1">
                  <span class="text-4xl font-semibold tracking-tight text-gray-900">Free</span>
                </div>
                <p class="text-sm text-gray-500 mt-2">For founders happy to wait for a slot.</p>
              </div>

              <ul class="space-y-3 mb-8 text-sm flex-1">
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">Live on homepage for 7 days</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">Badge for top 3 ranking products</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">High authority backlink</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-clock text-amber-500 mt-1 text-xs"></i>
                  <span class="text-amber-700">Launch delayed by ~1 week</span>
                </li>
              </ul>

              <a href="/submit"
                 class="block w-full text-center py-2.5 px-4 border border-gray-200 rounded-xl text-gray-900 font-medium text-sm hover:bg-gray-50 hover:border-gray-300 transition-colors">
                Get started
              </a>
            </div>

            <!-- Premium Plan -->
            <div class="bg-white rounded-2xl border border-orange-300 p-7 shadow-md flex flex-col relative ring-1 ring-orange-200">
              <div class="absolute -top-3 left-1/2 -translate-x-1/2">
                <span class="inline-flex items-center gap-1 bg-orange-600 text-white text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full">
                  Most popular
                </span>
              </div>

              <div class="mb-6">
                <h3 class="text-sm font-semibold text-orange-700 uppercase tracking-wider mb-3">Premium Launch</h3>
                <div class="flex items-baseline gap-1">
                  <span class="text-4xl font-semibold tracking-tight text-gray-900">$20</span>
                  <span class="text-gray-500 text-sm">/ launch</span>
                </div>
                <p class="text-sm text-gray-500 mt-2">Skip the queue and launch right away.</p>
              </div>

              <ul class="space-y-3 mb-8 text-sm flex-1">
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                  <span class="text-gray-700">Live on homepage for 14 days</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                  <span class="text-gray-700">Badge for top 3 ranking products</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                  <span class="text-gray-900 font-medium">Guaranteed high-authority backlink (37+ DR)</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-bolt text-orange-600 mt-1 text-xs"></i>
                  <span class="text-gray-700">Skip the queue — launch immediately</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-envelope text-orange-600 mt-1 text-xs"></i>
                  <span class="text-gray-700">Featured in our newsletter</span>
                </li>
              </ul>

              <a href="/submit?plan=premium" class="sh-btn-accent justify-center w-full">
                Choose Premium
              </a>
            </div>

            <!-- Featured Spot -->
            <div class="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm flex flex-col">
              <div class="mb-6">
                <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Featured Spot</h3>
                <div class="flex items-baseline gap-1">
                  <span class="text-4xl font-semibold tracking-tight text-gray-900">$50</span>
                  <span class="text-gray-500 text-sm">one-time</span>
                </div>
                <p class="text-sm text-gray-500 mt-2">Premium placement for 7 days.</p>
              </div>

              <ul class="space-y-3 mb-8 text-sm flex-1">
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-star text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">Featured placement in feed</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-eye text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">High visibility to daily visitors</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-border-all text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">Colorful gradient border on card</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fas fa-bolt text-gray-400 mt-1 text-xs"></i>
                  <span class="text-gray-700">One-time payment, no subscription</span>
                </li>
              </ul>

              <a href="/submit?plan=featured"
                 class="block w-full text-center py-2.5 px-4 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors">
                Choose Featured
              </a>
            </div>
          </div>

          <!-- FAQ Section -->
          <div class="mt-20 max-w-3xl mx-auto">
            <h2 class="text-2xl font-semibold tracking-tight text-center text-gray-900 mb-3">Frequently asked questions</h2>
            <p class="text-center text-gray-500 mb-10 text-sm">Anything else? Ping us on X.</p>

            <div class="space-y-3">
              <details class="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <summary class="flex items-center justify-between cursor-pointer px-6 py-5 list-none">
                  <h3 class="font-medium text-gray-900">What is a dofollow backlink?</h3>
                  <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                <div class="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                  A dofollow backlink passes SEO authority from our site (37+ DR) to yours, helping improve your search engine rankings.
                </div>
              </details>

              <details class="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <summary class="flex items-center justify-between cursor-pointer px-6 py-5 list-none">
                  <h3 class="font-medium text-gray-900">How long does my listing stay live?</h3>
                  <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                <div class="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                  Free listings stay live for 7 days, Premium listings for 14 days. Featured spots run for the duration you purchase.
                </div>
              </details>

              <details class="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <summary class="flex items-center justify-between cursor-pointer px-6 py-5 list-none">
                  <h3 class="font-medium text-gray-900">Can I submit multiple products?</h3>
                  <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                <div class="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                  Yes — free users get one free submission. For additional products, choose the Premium plan.
                </div>
              </details>
            </div>
          </div>
        </div>
      </main>

      <${Footer} />
    </div>
  `;
};

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  if (root) {
    render(html`<${PricingPage} />`, root);
  }
});
