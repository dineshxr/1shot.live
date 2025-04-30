// Vercel Analytics utility functions

/**
 * Track a custom event with Vercel Analytics
 * 
 * @param {string} eventName - Name of the event to track
 * @param {Object} [props] - Optional properties to include with the event
 */
export const trackEvent = (eventName, props = {}) => {
  if (typeof window !== 'undefined' && window.va) {
    window.va('event', {
      name: eventName,
      ...props
    });
  }
};

/**
 * Analytics event names used throughout the application
 */
export const ANALYTICS_EVENTS = {
  SUBMIT_FORM_OPEN: 'submit_form_open',
  SUBMIT_FORM_SUBMIT: 'submit_form_submit',
  SUBMIT_FORM_SUCCESS: 'submit_form_success',
  SUBMIT_FORM_ERROR: 'submit_form_error',
  STARTUP_VIEW: 'startup_view',
  STARTUP_LINK_COPY: 'startup_link_copy',
  SEARCH: 'search',
  EXTERNAL_LINK_CLICK: 'external_link_click'
};
