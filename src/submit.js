import { html } from 'htm/preact';
import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { auth } from './lib/auth.js';
import { LoginModal } from './components/login-modal.js';
import { SubmitStartupPage } from './components/submit-startup-page.js';
import { Footer } from './components/footer.js';

// Make hooks available globally
window.useState = useState;
window.useEffect = useEffect;
window.useRef = useRef;
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
    let lastUserId = null;
    let pageViewTracked = false;
    
    // Subscribe to auth state changes
    const unsubscribe = auth.subscribe((authState) => {
      // Only update if user actually changed
      if (authState.user?.id !== lastUserId) {
        lastUserId = authState.user?.id || null;
        setUser(authState.user);
        setAuthLoading(authState.loading);
        
        // Auto-show login modal if not authenticated after loading
        if (!authState.loading && !authState.user) {
          setShowLoginModal(true);
        }
      }
    });

    // Set initial user state
    const currentAuthState = auth.getAuthState();
    lastUserId = currentAuthState.user?.id || null;
    setUser(currentAuthState.user);
    setAuthLoading(currentAuthState.loading);
    
    // Auto-show login modal if not authenticated
    if (!currentAuthState.loading && !currentAuthState.user) {
      setShowLoginModal(true);
    }

    // Track page view only once
    if (!pageViewTracked) {
      pageViewTracked = true;
      window.trackEvent('submit_page_view');
    }

    return unsubscribe;
  }, []);

  // Handle login success
  const handleLoginSuccess = () => {
    setShowLoginModal(false);
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
              <a href="/submit" class="px-3 py-1.5 rounded-lg text-gray-900 bg-gray-100">Submit</a>
            </nav>
            <div class="flex items-center gap-2">
              ${user ? html`
                <div class="flex items-center gap-2 pl-2 ml-1">
                  <img
                    src=${user.user_metadata?.avatar_url || '/placeholder-avatar.png'}
                    alt="User avatar"
                    class="w-7 h-7 rounded-full ring-1 ring-gray-200"
                  />
                  <span class="hidden sm:inline text-sm text-gray-700">
                    ${user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                  </span>
                  <button
                    onClick=${() => auth.signOut()}
                    class="text-xs text-gray-500 hover:text-gray-900 transition-colors ml-1"
                  >
                    Sign out
                  </button>
                </div>
              ` : html`
                <button onClick=${() => setShowLoginModal(true)} class="sh-btn-primary">
                  <i class="fas fa-sign-in-alt text-xs"></i><span>Login</span>
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
