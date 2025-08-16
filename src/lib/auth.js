// Authentication service using ClerkJS (browser) and X (Twitter) login

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

// Helper: wait for Clerk to be available
async function waitForClerk() {
  if (typeof window === 'undefined') return null;
  if (window.clerk) return window.clerk;
  await new Promise((resolve) => {
    const onReady = () => {
      window.removeEventListener('clerk-ready', onReady);
      resolve();
    };
    window.addEventListener('clerk-ready', onReady);
  });
  return window.clerk;
}

// Map Clerk user to previous UI shape for compatibility
function mapClerkUser(clerkUser) {
  if (!clerkUser) return null;
  const external = (clerkUser.externalAccounts && clerkUser.externalAccounts[0]) || {};
  const username = clerkUser.username || external.username || null;
  const avatarUrl = clerkUser.imageUrl || null;
  return {
    ...clerkUser,
    user_metadata: {
      avatar_url: avatarUrl,
      user_name: username,
    },
    email: clerkUser.primaryEmailAddress?.emailAddress || null,
  };
}

let _clerkPoll = null;

// Initialize auth state
async function initAuth() {
  try {
    const clerk = await waitForClerk();

    const setFromClerk = () => {
      const mapped = mapClerkUser(clerk.user || null);
      authState = {
        user: mapped,
        session: clerk.session || null,
        loading: false,
        initialized: true
      };
      notifyListeners();
      window.dispatchEvent(new CustomEvent('auth-state-change', { 
        detail: { user: authState.user, session: authState.session } 
      }));
    };

    // Initial state
    setFromClerk();

    // Poll for changes (works across redirects)
    if (_clerkPoll) clearInterval(_clerkPoll);
    let lastId = clerk.user?.id || null;
    _clerkPoll = setInterval(() => {
      const currId = clerk.user?.id || null;
      if (currId !== lastId) {
        lastId = currId;
        setFromClerk();
      }
    }, 1000);

  } catch (error) {
    console.error('Error initializing auth (Clerk):', error);
    authState = {
      user: null,
      session: null,
      loading: false,
      initialized: true
    };
    notifyListeners();
  }
}

// Sign in with X (Twitter) via Clerk modal (ensure provider enabled in Clerk Dashboard)
async function signInWithX() {
  const clerk = await waitForClerk();
  await clerk.openSignIn({
    afterSignInUrl: '/',
    afterSignUpUrl: '/',
  });
}

// Sign out
async function signOut() {
  const clerk = await waitForClerk();
  await clerk.signOut();
  authState = {
    user: null,
    session: null,
    loading: false,
    initialized: true
  };
  notifyListeners();
  return true;
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
