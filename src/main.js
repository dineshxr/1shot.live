// @ts-nocheck

// Import Preact and hooks directly from CDN
import {
  h,
  render,
} from "https://unpkg.com/preact@10.13.1/dist/preact.module.js";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "https://unpkg.com/preact@10.13.1/hooks/dist/hooks.module.js";
import htm from "https://unpkg.com/htm@3.1.1/dist/htm.module.js";

// Import our root App component
import { App } from "./components/app.js";

// =========================================
// ANALYTICS IMPLEMENTATION
// =========================================
// Import analytics module
import { trackPageView, trackEvent, ANALYTICS_EVENTS } from './lib/analytics.js';

// Make analytics available globally
window.ANALYTICS_EVENTS = ANALYTICS_EVENTS;
window.trackPageView = trackPageView;
window.trackEvent = trackEvent;

// Initialize analytics and track initial page view
if (typeof window !== 'undefined') {
  // Track page view
  trackPageView();
}

// Import auth service and make it globally available
import { auth } from './lib/auth.js';
window.auth = auth;

// Make Preact and hooks available globally for our components
window.h = h;
window.useState = useState;
window.useEffect = useEffect;
window.useRef = useRef;
window.useMemo = useMemo;
window.html = htm.bind(h);

// Import configuration
import { config } from './config.js';

// Public environment variables
window.PUBLIC_ENV = {
  supabaseUrl: config.supabase.url,
  supabaseKey: config.supabase.anonKey,
  turnstileSiteKey: config.turnstile.siteKey,
};


// Render the App component
render(html`<${App} />`, document.getElementById("app-root"));
