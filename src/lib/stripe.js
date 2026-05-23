// Stripe Checkout Configuration
export const STRIPE_PUBLISHABLE_KEY = 'pk_live_51SqLQc9t8rFDtfIcFpHk9oQXi6RispJYCms2YMuDSqhAWg6hRU2RuElWihHHYkN6IcFdO7xxnLWdUjtk8Ufl55CW00edp4t6nM';

// Supabase Edge Function URL for creating checkout sessions
const CHECKOUT_FUNCTION_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/create-checkout';

// Load Stripe.js dynamically
let stripePromise = null;
export function getStripe() {
  if (!stripePromise) {
    stripePromise = new Promise((resolve) => {
      if (window.Stripe) {
        resolve(window.Stripe(STRIPE_PUBLISHABLE_KEY));
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => {
        resolve(window.Stripe(STRIPE_PUBLISHABLE_KEY));
      };
      document.head.appendChild(script);
    });
  }
  return stripePromise;
}

// Lightweight wrapper around window.va so we can instrument the paid funnel
// without crashing if Vercel Analytics hasn't loaded yet (e.g. local dev).
function trackStripeEvent(name, props) {
  try {
    if (typeof window !== 'undefined' && typeof window.va === 'function') {
      window.va('event', { name, ...props });
    }
  } catch (e) {
    // Analytics must never block the checkout flow.
  }
}

// Create checkout session and redirect
export async function createCheckoutSession(product, options = {}) {
  const { startupId, startupTitle, userEmail, successUrl, cancelUrl } = options;

  trackStripeEvent('stripe_checkout_requested', { product, has_startup_id: Boolean(startupId) });

  let response;
  try {
    response = await fetch(CHECKOUT_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product,
        startupId,
        startupTitle,
        userEmail,
        successUrl: successUrl || `${window.location.origin}/payment-success`,
        cancelUrl: cancelUrl || window.location.href,
      }),
    });
  } catch (networkError) {
    // Fetch itself failed — DNS, CORS preflight rejection, offline, etc.
    console.error('Stripe checkout network error:', networkError);
    trackStripeEvent('stripe_checkout_failed', {
      product,
      stage: 'network',
      error: String(networkError && networkError.message || networkError).slice(0, 200),
    });
    return { success: false, error: 'Network error while contacting Stripe. Please try again.' };
  }

  if (!response.ok) {
    let errorBody = '';
    try {
      const parsed = await response.json();
      errorBody = parsed?.error || JSON.stringify(parsed);
    } catch {
      try { errorBody = await response.text(); } catch { errorBody = ''; }
    }
    console.error('Stripe checkout HTTP error:', response.status, errorBody);
    trackStripeEvent('stripe_checkout_failed', {
      product,
      stage: 'http',
      status: response.status,
      // 401 here means the Edge Function flipped to verify_jwt=true — see
      // supabase/config.toml. Truncate body so we don't blow the props limit.
      error: String(errorBody).slice(0, 200),
    });
    return { success: false, error: errorBody || `Checkout failed (HTTP ${response.status})` };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (parseError) {
    trackStripeEvent('stripe_checkout_failed', { product, stage: 'parse', error: String(parseError.message).slice(0, 200) });
    return { success: false, error: 'Invalid response from checkout endpoint.' };
  }

  const url = payload && payload.url;
  if (!url) {
    trackStripeEvent('stripe_checkout_failed', { product, stage: 'no_url' });
    return { success: false, error: 'Stripe did not return a checkout URL.' };
  }

  console.info('[stripe] checkout session created, redirecting to', url);
  trackStripeEvent('stripe_checkout_redirecting', { product });

  // Redirect to Stripe Checkout. After this assignment the browser navigates
  // and JS execution effectively ends; the return below is only reached if
  // navigation is somehow blocked.
  window.location.href = url;

  return { success: true };
}

// Quick checkout function for buttons
export function openStripeCheckout(product, options = {}) {
  createCheckoutSession(product, options);
}
