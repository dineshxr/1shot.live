// We're not importing from @vercel/analytics directly since we're using the script tag approach
// This file provides utility functions to work with the global va() function

// Add TypeScript declarations for the Vercel Analytics global variables
// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore - Define va and vaq on the window object for TypeScript
  if (!window.va) {
    // @ts-ignore
    window.va = function() {
      // @ts-ignore
      (window.vaq = window.vaq || []).push(arguments);
      console.log('Vercel Analytics (mock):', arguments);
    };
  }
}

/**
 * Analytics event names used throughout the application
 */
export const ANALYTICS_EVENTS = {
  FORM_OPEN: 'form_open',
  FORM_SUBMIT: 'form_submit',
  LINK_CLICK: 'link_click',
  SHARE_CLICK: 'share_click',
};

/**
 * Track a page view with Vercel Analytics
 */
export const trackPageView = () => {
  if (typeof window !== 'undefined') {
    try {
      // For Vercel Web Analytics, we need to use the event API with a special event name
      // @ts-ignore - window.va is defined by the Vercel Analytics script
      if (window.va) {
        // @ts-ignore
        window.va('event', { name: 'pageview' });
        console.log('Vercel Analytics: Pageview tracked');
      }
    } catch (error) {
      console.error('Vercel Analytics error:', error);
    }
  }
};

/**
 * Track a custom event with Vercel Analytics
 * 
 * @param {string} eventName - Name of the event to track
 * @param {Object} [props] - Optional properties to include with the event
 */
export const trackEvent = (eventName, props = {}) => {
  if (typeof window !== 'undefined') {
    try {
      // @ts-ignore - window.va is defined by the Vercel Analytics script
      if (window.va) {
        // @ts-ignore
        window.va('event', { name: eventName, props });
        console.log(`Vercel Analytics: Event tracked - ${eventName}`, props);
      } else {
        console.log(`Vercel Analytics (mock): Event tracked - ${eventName}`, props);
      }
    } catch (error) {
      console.error('Vercel Analytics error:', error);
    }
  } else {
    console.log(`Vercel Analytics (mock): Event tracked - ${eventName}`, props);
  }
};

// Export a default object for ESM compatibility
export default {
  trackPageView,
  trackEvent,
  ANALYTICS_EVENTS
};
