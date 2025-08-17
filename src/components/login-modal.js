import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { auth } from '../lib/auth.js';

// Login modal component using email magic link authentication
/* global useState, useEffect, html, useLayoutEffect, useMemo, useCallback, useRef, useReducer */
export const LoginModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email'); // 'email' or 'sent'

  // Handle email submission
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await auth.signInWithEmail(email);
      if (result.success) {
        setStep('sent');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset modal state when opening
  useEffect(() => {
    if (isOpen) {
      setStep('email');
      setEmail('');
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
        
        <form onSubmit=${handleEmailSubmit}>
          <div class="mb-6">
            <p class="text-gray-700 mb-4">
              To submit your startup, please log in with your account.
            </p>
          </div>
          
          ${step === 'email' ? html`
          <!-- Email Input Step -->
          <div class="space-y-4">
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value=${email}
                onInput=${(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled=${loading}
              />
            </div>
            
            ${error && html`
              <div class="text-red-600 text-sm bg-red-50 p-3 rounded-md">
                ${error}
              </div>
            `}
            
            <button
              type="submit"
              disabled=${loading || !email.trim()}
              class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ${loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </div>
        ` : html`
          <!-- Magic Link Sent Step -->
          <div class="space-y-4">
            <div class="text-center">
              <div class="mb-4">
                <div class="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <i class="fas fa-envelope text-green-600 text-2xl"></i>
                </div>
              </div>
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Check your email</h3>
              <p class="text-sm text-gray-600 mb-4">
                We've sent a magic link to <strong>${email}</strong>
              </p>
              <p class="text-sm text-gray-500">
                Click the link in your email to sign in. You can close this window.
              </p>
            </div>
            
            <button
              type="button"
              onClick=${() => setStep('email')}
              class="w-full text-blue-600 hover:text-blue-800 text-sm"
              disabled=${loading}
            >
              ← Use a different email
            </button>
          </div>
        `}
        </form>
        
        <div class="mt-4 text-center">
          <p class="text-xs text-gray-500">
            By logging in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  `;
};
