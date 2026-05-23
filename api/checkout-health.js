// Probes the Supabase create-checkout Edge Function with a deliberately
// invalid payload (no product). Healthy response: HTTP 400 with
// {error: "Invalid product"} from the function itself — that proves the
// function is reachable AND has verify_jwt=false (anonymous browsers from
// /submit can invoke it).
//
// Symptoms decoded:
//   - status 200/400 from function → healthy
//   - status 401 → verify_jwt regressed to true; redeploy create-checkout
//   - status 5xx → function crashed (missing STRIPE_SECRET_KEY etc.)
//   - status 0 / fetch threw → DNS/network or Supabase down
//
// GET /api/checkout-health → {ok, status, body, hint, latencyMs}

const SUPABASE_CHECKOUT_URL =
  'https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/create-checkout';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(SUPABASE_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      reachable: false,
      latencyMs: Date.now() - startedAt,
      error: err && err.message ? err.message : String(err),
      hint: 'Supabase Edge Function host unreachable (DNS/network).',
    });
  }

  const latencyMs = Date.now() - startedAt;
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    bodyText = '<unreadable body>';
  }

  let hint = null;
  if (response.status === 401) {
    hint =
      'verify_jwt is true on create-checkout. The frontend posts without an Authorization header, so every "Continue to Payment" 401s. ' +
      'Redeploy: `supabase functions deploy create-checkout` after ensuring supabase/config.toml pins verify_jwt = false.';
  } else if (response.status >= 500) {
    hint =
      'Edge Function crashed. Most common cause: STRIPE_SECRET_KEY or a STRIPE_*_PRICE_ID env var is missing/inactive.';
  } else if (response.status === 400 && bodyText.includes('Invalid product')) {
    hint = 'Healthy. Function is reachable, anonymous, and validating input.';
  } else if (response.status === 200) {
    hint =
      'Unexpected 200 from an empty body — function may be silently accepting bad input. Investigate.';
  } else {
    hint = `Unexpected status ${response.status}. Inspect body.`;
  }

  const ok = response.status === 400 && bodyText.includes('Invalid product');

  return res.status(ok ? 200 : 503).json({
    ok,
    reachable: true,
    status: response.status,
    latencyMs,
    body: bodyText.slice(0, 500),
    hint,
  });
}
