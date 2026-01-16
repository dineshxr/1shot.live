import { html } from 'htm/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { auth } from './lib/auth.js';
import { LoginModal } from './components/login-modal.js';
import { SubmitStartupPage } from './components/submit-startup-page.js';
import { Footer } from './components/footer.js';

// Make hooks available globally
window.useState = useState;
window.useEffect = useEffect;
window.html = html;

// Analytics event tracking
window.ANALYTICS_EVENTS = {
  FORM_OPEN: 'form_open',
  FORM_SUBMIT: 'form_submit',
  FORM_NEXT_PAGE: 'form_next_page',
  FORM_PREV_PAGE: 'form_prev_page',
  SUCCESS_PAGE_VIEW: 'success_page_view'
};

window.trackEvent = (eventName, data = {}) => {
  console.log('Track event:', eventName, data);
  if (typeof window.va === 'function') {
    window.va('event', { name: eventName, ...data });
  }
};

// Submit Page App Component
const SubmitApp = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = auth.subscribe((authState) => {
      setUser(authState.user);
      setAuthLoading(authState.loading);
      
      // Auto-show login modal if not authenticated after loading
      if (!authState.loading && !authState.user) {
        setShowLoginModal(true);
      }
    });

    // Set initial user state
    const currentAuthState = auth.getAuthState();
    setUser(currentAuthState.user);
    setAuthLoading(currentAuthState.loading);
    
    // Auto-show login modal if not authenticated
    if (!currentAuthState.loading && !currentAuthState.user) {
      setShowLoginModal(true);
    }

    // Track page view
    window.trackEvent('submit_page_view');

    return unsubscribe;
  }, []);

  // Handle login success
  const handleLoginSuccess = () => {
    setShowLoginModal(false);
  };

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
            <div class="mt-4 md:mt-0 flex items-center gap-4">
              ${user ? html`
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-2">
                    <img 
                      src=${user.user_metadata?.avatar_url || '/placeholder-avatar.png'} 
                      alt="User avatar"
                      class="w-8 h-8 rounded-full border-2 border-black"
                    />
                    <span class="font-medium text-sm">
                      ${user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                    </span>
                  </div>
                  <button
                    onClick=${() => auth.signOut()}
                    class="neo-button inline-flex items-center px-3 py-1 bg-red-400 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-red-500 font-bold text-sm"
                  >
                    <i class="fas fa-sign-out-alt mr-1"></i> Logout
                  </button>
                </div>
              ` : html`
                <button
                  onClick=${() => setShowLoginModal(true)}
                  class="neo-button inline-flex items-center px-4 py-2 bg-green-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold"
                >
                  <i class="fas fa-sign-in-alt mr-2"></i> Login
                </button>
              `}
            </div>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1">
        <${SubmitStartupPage} 
          user=${user} 
          authLoading=${authLoading}
          onLoginRequired=${() => setShowLoginModal(true)}
        />
      </main>

      <!-- Footer -->
      <${Footer} />

      <!-- Login Modal -->
      <${LoginModal} 
        isOpen=${showLoginModal} 
        onClose=${() => setShowLoginModal(false)}
        onLoginSuccess=${handleLoginSuccess}
      />
    </div>
  `;
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  if (root) {
    render(html`<${SubmitApp} />`, root);
  }
});
