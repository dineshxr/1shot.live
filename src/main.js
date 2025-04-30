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
// ANALYTICS IMPLEMENTATION (STANDALONE)
// =========================================
// This is a completely standalone analytics implementation
// that doesn't rely on any imports/exports to avoid issues with ad blockers

// Define analytics event names globally
window.ANALYTICS_EVENTS = {
  FORM_OPEN: 'form_open',
  FORM_SUBMIT: 'form_submit',
  LINK_CLICK: 'link_click',
};

// Create global analytics functions
window.trackPageView = function() {
  if (typeof window.va !== 'undefined') {
    try {
      window.va('pageview');
      console.log('Vercel Analytics: Pageview tracked');
    } catch (error) {
      console.error('Vercel Analytics error:', error);
    }
  }
};

window.trackEvent = function(eventName, props = {}) {
  if (typeof window.va !== 'undefined') {
    try {
      window.va('event', { name: eventName, props });
      console.log(`Vercel Analytics: Event tracked - ${eventName}`, props);
    } catch (error) {
      console.error('Vercel Analytics error:', error);
    }
  } else {
    console.log(`Vercel Analytics (mock): Event tracked - ${eventName}`, props);
  }
};

// Initialize Vercel Analytics
// Using direct implementation to avoid module loading issues
if (typeof window !== 'undefined') {
  // Create a fallback analytics function if Vercel Analytics is blocked
  if (!window.va) {
    window.va = function(command, params) {
      console.log(`Vercel Analytics (mock): ${command}`, params || '');
    };
  }
  
  // Initialize analytics
  try {
    window.va('init');
    // Track page view
    window.trackPageView();
  } catch (error) {
    console.error('Vercel Analytics initialization error:', error);
    // Even if analytics fail, the site should continue to work
  }
}

// Make Preact and hooks available globally for our components
window.h = h;
window.useState = useState;
window.useEffect = useEffect;
window.useRef = useRef;
window.useMemo = useMemo;
window.html = htm.bind(h);

// Public environment variables
window.PUBLIC_ENV = {
  supabaseUrl: "https://lbayphzxmdtdmrqmeomt.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo",
  turnstileSiteKey: "0x4AAAAAAA_Rl5VDA4u6EMKm",
};

// Render the App component
render(html`<${App} />`, document.getElementById("app-root"));
