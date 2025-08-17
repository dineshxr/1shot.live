import { createClient } from '@supabase/supabase-js';

// Supabase client for auth operations - singleton pattern to prevent multiple instances
const supabaseUrl = window.PUBLIC_ENV?.supabaseUrl || 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const supabaseKey = window.PUBLIC_ENV?.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';

// Create a single global Supabase instance
let supabase;
if (!window.supabaseClient) {
  window.supabaseClient = createClient(supabaseUrl, supabaseKey);
}
supabase = window.supabaseClient;

// Auth state management
let authState = {
  user: null,
  session: null,
  loading: true,
  initialized: false
};

// Auth state listeners
let listeners = [];

// Subscribe to auth state changes
function subscribe(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

// Notify all listeners of auth state changes
function notifyListeners() {
  listeners.forEach(listener => listener(authState));
}

// Update auth state and notify listeners
function updateAuthState(user, session, loading = false) {
  authState = {
    user: user,
    session: session,
    loading: loading,
    initialized: true
  };
  notifyListeners();
  window.dispatchEvent(new CustomEvent('auth-state-change', { 
    detail: { user: authState.user, session: authState.session } 
  }));
}

// Initialize auth state from Supabase
async function initAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Initial session:', session);
    updateAuthState(session?.user || null, session, false);

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session);
      updateAuthState(session?.user || null, session, false);
    });

  } catch (error) {
    console.error('Error initializing auth:', error);
    updateAuthState(null, null, false);
  }
}

// Get current user
function getCurrentUser() {
  return authState.user;
}

// Get current session
function getCurrentSession() {
  return authState.session;
}

// Check if user is authenticated
function isAuthenticated() {
  return !!authState.user;
}

// Get auth state
function getAuthState() {
  return { ...authState };
}

// Auth service using Supabase Auth
export const auth = {
  // Sign in with email (sends magic link)
  async signInWithEmail(email) {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback.html`
        }
      });
      
      if (error) {
        throw error;
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Sign in error:', error);
      throw new Error(error.message || 'Failed to send magic link');
    }
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  // Check if user is signed in
  async isSignedIn() {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  },

  // Sign out
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      throw new Error('Failed to sign out');
    }
  },

  // Listen for auth state changes
  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      updateAuthState(session?.user || null, session, false);
      callback(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  },

  // Subscribe to auth state changes (alias for compatibility)
  subscribe(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const authState = {
        user: session?.user || null,
        loading: false
      };
      updateAuthState(authState.user, authState.loading);
      callback(authState);
    });

    return () => {
      subscription.unsubscribe();
    };
  },

  // Get current session
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  // Compatibility methods
  getCurrentUser,
  getCurrentSession,
  isAuthenticated,
  getAuthState,
  subscribe,
  initAuth
};

// Make auth available globally for debugging
window.auth = auth;

// Initialize auth on load
initAuth();
