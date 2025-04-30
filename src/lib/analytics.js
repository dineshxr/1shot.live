// Simple Vercel Analytics utility functions

/**
 * Track a page view with Vercel Analytics
 */
export const trackPageView = () => {
  if (typeof window !== 'undefined' && window.va) {
    try {
      window.va('pageview');
      console.log('Vercel Analytics: Pageview tracked');
    } catch (error) {
      console.error('Vercel Analytics error:', error);
    }
  }
};

/**
 * Track a custom event with Vercel Analytics (simplified version)
 * 
 * @param {string} eventName - Name of the event to track
 * @param {Object} [props] - Optional properties to include with the event
 */
export const trackEvent = (eventName, props = {}) => {
  if (typeof window !== 'undefined' && window.va) {
    try {
      window.va('event', { name: eventName });
      console.log(`Vercel Analytics: Event tracked - ${eventName}`);
    } catch (error) {
      console.error('Vercel Analytics error:', error);
    }
  }
};

/**
 * Analytics event names used throughout the application
 */
export const ANALYTICS_EVENTS = {
  FORM_OPEN: 'form_open',
  FORM_SUBMIT: 'form_submit',
  LINK_CLICK: 'link_click'
};
