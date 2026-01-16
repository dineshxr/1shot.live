import { html } from 'htm/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { auth } from './lib/auth.js';
import { Footer } from './components/footer.js';

// Make hooks available globally
window.useState = useState;
window.useEffect = useEffect;
window.html = html;

// Pricing Page Component
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
    <div class="min-h-screen flex flex-col bg-gray-50">
      <!-- Header -->
      <header class="bg-blue-400 text-black border-b-4 border-black">
        <div class="container max-w-6xl mx-auto px-4 py-6">
          <div class="flex flex-col md:flex-row justify-between items-center">
            <div class="flex items-center">
              <a href="/" class="flex items-center hover:opacity-80 transition-opacity">
                <img src="/src/sh-logo.png" alt="SubmitHunt Logo" class="w-10 h-10 mr-3" />
                <h1 class="text-2xl md:text-3xl font-bold">Submit Hunt</h1>
              </a>
              <a href="/" class="ml-4 px-3 py-1 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 font-bold text-sm">
                ← Back to Home
              </a>
            </div>
            <div class="mt-4 md:mt-0">
              <a
                href="/submit"
                class="neo-button inline-flex items-center px-4 py-2 bg-green-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold"
              >
                <i class="fas fa-rocket mr-2"></i> Submit Product
              </a>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1 py-12 px-4">
        <div class="max-w-6xl mx-auto">
          <!-- Page Header -->
          <div class="text-center mb-12">
            <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h1>
            <p class="text-xl text-gray-600 max-w-2xl mx-auto">
              Choose the perfect plan to launch your startup and get discovered by thousands of daily visitors
            </p>
          </div>

          <!-- Pricing Cards -->
          <div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            
            <!-- Free Plan -->
            <div class="bg-white rounded-2xl border-2 border-gray-200 p-8 hover:shadow-lg transition-shadow">
              <div class="mb-6">
                <h3 class="text-xl font-bold text-gray-900 mb-2">Standard Launch</h3>
                <div class="flex items-baseline">
                  <span class="text-4xl font-bold text-gray-900">Free</span>
                </div>
              </div>
              
              <div class="space-y-4 mb-8">
                <div class="flex items-start gap-3">
                  <span class="text-gray-400 mt-0.5">
                    <i class="fas fa-home"></i>
                  </span>
                  <span class="text-gray-700">Live on homepage for 7 days</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-trophy"></i>
                  </span>
                  <span class="text-gray-700">
                    <span class="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-sm font-medium">Badge for top 3 ranking products</span>
                  </span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-gray-400 mt-0.5">
                    <i class="fas fa-chart-bar"></i>
                  </span>
                  <span class="text-gray-700">High authority backlink for top 3 ranking products</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-red-500 mt-0.5">
                    <i class="fas fa-clock"></i>
                  </span>
                  <span class="text-red-600 font-medium">⏳ Launch delayed ~1 week</span>
                </div>
              </div>
              
              <a
                href="/submit"
                class="block w-full text-center py-3 px-4 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                Get Started
              </a>
            </div>

            <!-- Premium Plan -->
            <div class="bg-white rounded-2xl border-4 border-orange-400 p-8 shadow-lg relative">
              <div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span class="bg-orange-400 text-white text-sm font-bold px-4 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
              
              <div class="mb-6">
                <h3 class="text-xl font-bold text-gray-900 mb-2">Premium Launch</h3>
                <div class="flex items-baseline">
                  <span class="text-4xl font-bold text-gray-900">$5</span>
                  <span class="text-gray-500 ml-1">/launch</span>
                </div>
              </div>
              
              <div class="space-y-4 mb-8">
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-home"></i>
                  </span>
                  <span class="text-gray-700">Live on homepage for 14 days</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-trophy"></i>
                  </span>
                  <span class="text-gray-700">Badge for top 3 ranking products</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-chart-bar"></i>
                  </span>
                  <span class="text-gray-700 font-semibold">Guaranteed high authority backlink (37+ DR)</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-bolt"></i>
                  </span>
                  <span class="text-gray-700">Skip the queue - launch immediately</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-envelope"></i>
                  </span>
                  <span class="text-gray-700">Featured in our newsletter</span>
                </div>
              </div>
              
              <a
                href="https://submit.gumroad.com/l/featured"
                target="_blank"
                class="block w-full text-center py-3 px-4 bg-orange-400 border-2 border-orange-500 rounded-lg text-white font-bold hover:bg-orange-500 transition-all shadow-md"
              >
                Choose Premium
              </a>
            </div>

            <!-- Featured Spot -->
            <div class="bg-white rounded-2xl border-2 border-gray-200 p-8 hover:shadow-lg transition-shadow">
              <div class="mb-6">
                <h3 class="text-xl font-bold text-gray-900 mb-2">Featured Spot</h3>
                <div class="text-sm text-gray-500 mb-4">Premium placement options</div>
              </div>
              
              <!-- Spot Options -->
              <div class="space-y-4 mb-6">
                <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div class="flex justify-between items-start">
                    <div>
                      <div class="font-semibold text-gray-900">Top Spot</div>
                      <div class="text-sm text-gray-500">Top of page placement</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold text-gray-900">$45<span class="text-sm font-normal text-gray-500">/week</span></div>
                    </div>
                  </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div class="flex justify-between items-start">
                    <div>
                      <div class="font-semibold text-gray-900">Mid-Feed Spot</div>
                      <div class="text-sm text-gray-500">Between 3rd and 4th place</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold text-gray-900">$20<span class="text-sm font-normal text-gray-500">/week</span></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="space-y-3 mb-8 text-sm">
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-star"></i>
                  </span>
                  <span class="text-gray-700">Premium placement on landing page</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-random"></i>
                  </span>
                  <span class="text-gray-700">Random featured product shown on each launch page</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-eye"></i>
                  </span>
                  <span class="text-gray-700">High visibility to daily visitors</span>
                </div>
                
                <div class="flex items-start gap-3">
                  <span class="text-orange-500 mt-0.5">
                    <i class="fas fa-times-circle"></i>
                  </span>
                  <span class="text-gray-700">Cancel anytime</span>
                </div>
              </div>
              
              <p class="text-xs text-gray-400 mb-4 italic">
                Features stay up until they hit at least $1 CPC, but they almost always do in the allotted time anyway
              </p>
              
              <a
                href="https://x.com/submithunt"
                target="_blank"
                class="block w-full text-center py-3 px-4 bg-orange-400 border-2 border-orange-500 rounded-lg text-white font-bold hover:bg-orange-500 transition-all"
              >
                Contact Us
              </a>
            </div>
          </div>

          <!-- FAQ Section -->
          <div class="mt-16 max-w-3xl mx-auto">
            <h2 class="text-2xl font-bold text-center text-gray-900 mb-8">Frequently Asked Questions</h2>
            
            <div class="space-y-4">
              <div class="bg-white rounded-lg border border-gray-200 p-6">
                <h3 class="font-bold text-gray-900 mb-2">What is a dofollow backlink?</h3>
                <p class="text-gray-600">A dofollow backlink passes SEO authority from our site (37+ DR) to yours, helping improve your search engine rankings.</p>
              </div>
              
              <div class="bg-white rounded-lg border border-gray-200 p-6">
                <h3 class="font-bold text-gray-900 mb-2">How long does my listing stay live?</h3>
                <p class="text-gray-600">Free listings stay live for 7 days, while Premium listings stay for 14 days. Featured spots run for the duration you purchase.</p>
              </div>
              
              <div class="bg-white rounded-lg border border-gray-200 p-6">
                <h3 class="font-bold text-gray-900 mb-2">Can I submit multiple products?</h3>
                <p class="text-gray-600">Yes! Free users get one free submission. For additional products, choose the Premium plan.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Footer -->
      <${Footer} />
    </div>
  `;
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  if (root) {
    render(html`<${PricingPage} />`, root);
  }
});
