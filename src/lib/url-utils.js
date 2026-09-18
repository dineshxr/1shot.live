/**
 * Adds a referral parameter to external URLs
 * @param {string} url - The URL to add the referral parameter to
 * @returns {string} - The URL with the referral parameter added
 */
export function addReferralParam(url) {
  if (!url) return url;
  
  try {
    // Parse the URL
    const parsedUrl = new URL(url);
    
    // Only add the referral parameter if it's not already present
    if (!parsedUrl.searchParams.has('ref')) {
      parsedUrl.searchParams.append('ref', 'submithunt');
    }
    
    return parsedUrl.toString();
  } catch (error) {
    // If URL parsing fails, try to add the parameter manually
    // This handles cases where the URL might not be properly formatted
    if (url.includes('?')) {
      // URL already has query parameters
      return `${url}${url.includes('ref=') ? '' : '&ref=submithunt'}`;
    } else {
      // URL has no query parameters
      return `${url}?ref=submithunt`;
    }
  }
}

/**
 * Normalizes what a maker typed into the "website URL" field: trims it and
 * prefixes https:// when no scheme was given, so "mystartup.com" and
 * "www.mystartup.com" become valid URLs. Anything already carrying a
 * "scheme://" is left alone (so http:// stays http://, and a non-web scheme
 * like ftp:// is left for validation to reject).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeWebsiteUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, '')}`;
}
