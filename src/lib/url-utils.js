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
