// Authentication service using Supabase and X (Twitter) login
import { supabaseClient } from './supabase.js';

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

// Initialize auth state
async function initAuth() {
  try {
    const supabase = supabaseClient();
    
    if (!supabase) {
      console.error('Supabase client not available');
      authState = {
        user: null,
        session: null,
        loading: false,
        initialized: true
      };
      notifyListeners();
      return;
    }
    
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    
    authState = {
      user: session?.user ?? null,
      session: session,
      loading: false,
      initialized: true
    };
    
    notifyListeners();
    
    // Set up auth state change listener
    supabase.auth.onAuthStateChange((event, session) => {
      authState = {
        user: session?.user ?? null,
        session: session,
        loading: false,
        initialized: true
      };
      
      notifyListeners();
      
      // Emit custom event for auth state changes
      window.dispatchEvent(new CustomEvent('auth-state-change', { 
        detail: { user: authState.user, session: authState.session } 
      }));
    });
    
  } catch (error) {
    console.error('Error initializing auth:', error);
    authState = {
      user: null,
      session: null,
      loading: false,
      initialized: true
    };
    notifyListeners();
  }
}

// Sign in with X (Twitter)
async function signInWithX() {
  try {
    const supabase = supabaseClient();
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'twitter',
      options: {
        redirectTo: window.location.origin,
        scopes: 'tweet.read users.read account.read'
      }
    });
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error signing in with X:', error);
    throw error;
  }
}

// Sign out
async function signOut() {
  try {
    const supabase = supabaseClient();
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      throw error;
    }
    
    authState = {
      user: null,
      session: null,
      loading: false,
      initialized: true
    };
    
    notifyListeners();
    
    return true;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
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

// Initialize auth on module load
initAuth();

// Export auth service
export const auth = {
  signInWithX,
  signOut,
  getCurrentUser,
  getCurrentSession,
  isAuthenticated,
  getAuthState,
  subscribe,
  initAuth
};
