// URL metadata auto-fill (Phase 1, low-friction ingestion). Uses the same
// Microlink API the screenshot service already relies on, but in metadata mode,
// to pre-fill the submission form from a target URL.

const MICROLINK_URL = 'https://api.microlink.io';
const FETCH_TIMEOUT_MS = 9000;

// Fetch { title, description, logo, image, publisher } for a URL.
// Returns null on any failure (auto-fill is best-effort and must never block).
export const fetchSiteMetadata = async (url) => {
  if (!url) return null;

  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  const apiUrl = new URL(MICROLINK_URL);
  apiUrl.searchParams.set('url', target);
  // meta only — no screenshot here (the submit flow captures that separately).
  apiUrl.searchParams.set('screenshot', 'false');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status !== 'success' || !body.data) return null;

    const d = body.data;
    return {
      title: d.title || d.publisher || '',
      description: d.description || '',
      logo: (d.logo && d.logo.url) || '',
      image: (d.image && d.image.url) || (d.screenshot && d.screenshot.url) || '',
      publisher: d.publisher || '',
    };
  } catch (e) {
    console.warn('fetchSiteMetadata failed:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
};
