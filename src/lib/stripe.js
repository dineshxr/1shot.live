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

// Create checkout session and redirect
export async function createCheckoutSession(product, options = {}) {
  const { startupId, startupTitle, userEmail, successUrl, cancelUrl } = options;
  
  try {
    const response = await fetch(CHECKOUT_FUNCTION_URL, {
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const { url } = await response.json();
    
    // Redirect to Stripe Checkout
    if (url) {
      window.location.href = url;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return { success: false, error: error.message };
  }
}

// Quick checkout function for buttons
export function openStripeCheckout(product, options = {}) {
  createCheckoutSession(product, options);
}
