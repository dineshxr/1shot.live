import { supabaseClient } from './supabase-client.js';
import { config } from '../config.js';

const VERIFY_BACKLINK_URL = `${config.supabase.url}/functions/v1/verify-backlink`;

// The badge image lives at /src/submit-hunt-badge.png (same asset success.html
// uses). The embed is deliberately do-follow — no rel="nofollow" — so it passes
// our own verifier and gives the maker real link equity.
export const BADGE_IMG_URL = 'https://submithunt.com/src/submit-hunt-badge.png';

export const BADGE_EMBED_CODE =
  `<a href="https://submithunt.com" target="_blank">` +
  `<img src="${BADGE_IMG_URL}" alt="Featured on Submit Hunt" width="200" height="auto" />` +
  `</a>`;

// Plain text-link alternative ("set your own link") — also do-follow.
export const TEXT_LINK_EMBED_CODE =
  `<a href="https://submithunt.com" target="_blank">Featured on Submit Hunt</a>`;

// Ask the verify-backlink Edge Function to fetch linkUrl and confirm a do-follow
// link to submithunt.com on the product's own site. On success the function
// records the verification server-side (keyed to the signed-in user + product
// host), which is what unlocks the free insert.
// Returns { verified: boolean, error?: string }.
export const verifyBacklink = async (linkUrl, productUrl) => {
  try {
    const supabase = supabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { verified: false, error: 'Please sign in to verify your backlink.' };
    }

    const res = await fetch(VERIFY_BACKLINK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ linkUrl, productUrl }),
    });

    let payload = {};
    try { payload = await res.json(); } catch (e) { /* non-JSON */ }

    if (res.ok && payload.verified) {
      return { verified: true };
    }
    return { verified: false, error: payload.error || `Verification failed (HTTP ${res.status}).` };
  } catch (e) {
    console.error('verifyBacklink error:', e);
    return { verified: false, error: 'Network error while verifying. Please try again.' };
  }
};

// Combined free-plan unlock status for the signed-in user + the product URL:
// { eligible, upvotes_done, upvotes_required, comments_done, comments_required,
//   backlink_verified, is_returning }. Fails OPEN (eligible) if the RPC isn't
// deployed yet — the DB trigger is the authoritative gate; this only drives UI.
export const getFreeSubmissionStatus = async (productUrl) => {
  try {
    const supabase = supabaseClient();
    const { data, error } = await supabase.rpc('get_free_submission_status', { p_product_url: productUrl || '' });
    if (error || !data) {
      console.warn('Free-submission status unavailable, failing open:', error);
      return {
        eligible: true, unavailable: true,
        upvotes_done: 0, upvotes_required: 3,
        comments_done: 0, comments_required: 1,
        backlink_verified: false, is_returning: false,
      };
    }
    return data;
  } catch (e) {
    console.warn('Free-submission status failed, failing open:', e);
    return {
      eligible: true, unavailable: true,
      upvotes_done: 0, upvotes_required: 3,
      comments_done: 0, comments_required: 1,
      backlink_verified: false, is_returning: false,
    };
  }
};
