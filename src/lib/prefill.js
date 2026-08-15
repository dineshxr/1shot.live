import { supabaseClient } from './supabase-client.js';
import { config } from '../config.js';
import { uploadImage } from './upload-client.js';

const AI_PREFILL_URL = `${config.supabase.url}/functions/v1/ai-prefill`;
const DR_URL = `${config.supabase.url}/functions/v1/domain-rating`;

// AI-Powered Form Prefill: ask the ai-prefill Edge Function (OpenRouter) to read
// the URL and return structured fields + logo/cover/socials.
// Resolves to the data object, or { error } on failure.
export const aiPrefill = async (url) => {
  try {
    const supabase = supabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Please sign in to use AI prefill.' };

    const res = await fetch(AI_PREFILL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabase.anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return { error: data.error || `Prefill failed (HTTP ${res.status}).` };
    return data;
  } catch (e) {
    console.error('aiPrefill error:', e);
    return { error: 'Network error during prefill. Please try again.' };
  }
};

// Ahrefs Domain Rating (0-100) for a URL, via the free public endpoint proxy.
// Resolves to { dr: number } or { error }.
export const fetchDomainRating = async (url) => {
  try {
    const res = await fetch(DR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (typeof data.domain_rating === 'number') return { dr: data.domain_rating };
    return { error: data.error || 'No Domain Rating available.' };
  } catch (e) {
    return { error: 'Domain Rating lookup failed.' };
  }
};

// Upload a user-provided logo/cover to the public startup-assets bucket and
// return its public URL. kind is just a filename prefix ('logo' | 'cover').
export const uploadAsset = async (file, kind) => uploadImage(file, kind);
