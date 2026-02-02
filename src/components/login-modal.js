import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { auth } from '../lib/auth.js';

// Login modal component using Google OAuth authentication
/* global useState, useEffect, html, useLayoutEffect, useMemo, useCallback, useRef, useReducer */
export const LoginModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle Google sign in
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      await auth.signInWithGoogle();
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // Reset modal state when opening
  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  // Listen for auth state changes to auto-close modal on successful login
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChange((user) => {
      if (user && isOpen) {
        onLoginSuccess?.(user);
        onClose();
      }
    });

    return unsubscribe;
  }, [isOpen, onLoginSuccess, onClose]);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
        window.location.href = '/';
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close modal on outside click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
      window.location.href = '/';
    }
  };

  if (!isOpen) return null;

  return html`
    <div 
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick=${handleBackdropClick}
    >
      <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col md:flex-row">
        <!-- Left Side - Benefits -->
        <div class="bg-gradient-to-br from-orange-50 to-yellow-50 p-8 md:p-12 md:w-1/2">
          <div class="flex items-center gap-3 mb-8">
            <img src="/src/sh-logo.png" alt="SubmitHunt" class="w-10 h-10" />
            <span class="text-xl font-bold text-gray-900">SubmitHunt</span>
          </div>
          
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6 leading-tight">
            Launch your startup<br/>to thousands of users.
          </h2>
          
          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <span class="text-orange-500 mt-0.5">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </span>
              <span class="text-gray-700">Join thousands of successful product launches on SubmitHunt</span>
            </div>
            
            <div class="flex items-start gap-3">
              <span class="text-orange-500 mt-0.5">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </span>
              <span class="text-gray-700">High visibility to daily visitors</span>
            </div>
            
            <div class="flex items-start gap-3">
              <span class="text-orange-500 mt-0.5">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </span>
              <span class="text-gray-700">Badge for top 3 ranking products</span>
            </div>
            
            <div class="flex items-start gap-3">
              <span class="text-orange-500 mt-0.5">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </span>
              <span class="text-gray-700">Get a 37+ DR dofollow backlink</span>
            </div>
          </div>
        </div>
        
        <!-- Right Side - Login Form -->
        <div class="p-8 md:p-12 md:w-1/2 relative">
          <button 
            onClick=${() => {
      onClose();
      window.location.href = '/';
    }}
            class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            disabled=${loading}
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
          
          <h3 class="text-2xl font-bold text-gray-900 mb-2">Log in to your account</h3>
          <p class="text-gray-500 mb-8">Sign in to submit your startup and get discovered</p>
          
          ${error && html`
            <div class="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
              <i class="fas fa-exclamation-circle mr-2"></i>
              ${error}
            </div>
          `}
          
          <button
            type="button"
            onClick=${handleGoogleSignIn}
            disabled=${loading}
            class="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-3.5 px-4 rounded-lg hover:bg-gray-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            ${loading ? 'Signing in...' : 'Continue with Google'}
          </button>
          
          <p class="mt-6 text-xs text-gray-400 text-center">
            If you do not have an account with us, this will create one for you.
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  `;
};
