import { auth } from '../lib/auth.js';

// Login modal component
/* global useState, useEffect, html, useLayoutEffect, useMemo, useCallback, useRef, useReducer */
export const LoginModal = ({ isOpen, onClose, onLogin }) => {
  /* global useState, useEffect, html, useLayoutEffect, useMemo, useCallback, useRef, useReducer */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle X login
  const handleXLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await auth.signInWithX();
      
      // The OAuth flow will handle redirect, so we'll wait for the callback
      // The auth state change will be handled by the auth service
      
    } catch (err) {
      setError(err.message || 'Failed to sign in with X');
      setLoading(false);
    }
  };

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close modal on outside click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return html`
    <div 
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick=${handleBackdropClick}
    >
      <div class="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 border-2 border-black">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl font-bold text-black">Login Required</h2>
          <button 
            onClick=${onClose}
            class="text-gray-500 hover:text-gray-700 text-2xl"
            disabled=${loading}
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="mb-6">
          <p class="text-gray-700 mb-4">
            To submit your startup, please log in with your X (Twitter) account.
            This helps us maintain quality and prevent spam submissions.
          </p>
          
          ${error && html`
            <div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              ${error}
            </div>
          `}
        </div>
        
        <div class="space-y-4">
          <button
            onClick=${handleXLogin}
            disabled=${loading}
            class="w-full flex items-center justify-center px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ${loading ? html`
              <i class="fas fa-spinner fa-spin mr-2"></i>
              Connecting...
            ` : html`
              <i class="fab fa-x-twitter mr-2 text-xl"></i>
              Continue with X
            `}
          </button>
          
          <button
            onClick=${onClose}
            disabled=${loading}
            class="w-full px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        
        <div class="mt-4 text-center">
          <p class="text-xs text-gray-500">
            By logging in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  `;
};
