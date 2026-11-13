// Product-link policy — the single source of truth for whether a listing's
// outbound link passes equity. Imported by the browser (src/components/…) and
// by the Vercel functions (api/startup.js, api/blog.js), so it must stay a
// dependency-free ES module.
//
// Matches the promise on /pricing: Premium and Featured listings get a
// guaranteed do-follow backlink; free listings get one once their SubmitHunt
// badge is verified (startups.backlink_verified_at); everything else is
// nofollow. `noopener` is tab-safety only and has no SEO effect.

export const isVetted = (startup) =>
  !!startup &&
  (startup.plan === 'premium' || startup.plan === 'featured' || !!startup.backlink_verified_at);

export const productRel = (startup) => (isVetted(startup) ? 'noopener' : 'nofollow noopener');

const OWN_HOST = /^https?:\/\/([a-z0-9-]+\.)*submithunt\.com(?=[/?#:]|$)/i;

// Applies the policy to every external <a> in an HTML string (e.g. a review
// post about `startup`): unvetted listings' links get rel="nofollow noopener";
// vetted listings' links are left exactly as written. Internal links are
// never touched.
export function applyLinkPolicy(html, startup) {
  const src = html == null ? '' : String(html);
  if (isVetted(startup)) return src;
  return src.replace(/<a\b([^>]*)>/gi, (tag, attrs) => {
    const m = attrs.match(/\shref\s*=\s*(["'])(.*?)\1/i);
    const href = m ? m[2] : '';
    if (!/^https?:\/\//i.test(href) || OWN_HOST.test(href)) return tag;
    const rest = attrs.replace(/\srel\s*=\s*(["']).*?\1/i, '');
    return `<a${rest} rel="nofollow noopener">`;
  });
}
