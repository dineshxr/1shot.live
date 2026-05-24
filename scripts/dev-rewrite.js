// Live-server middleware that mirrors the production Vercel/Netlify rewrites
// so clean URLs work locally during development.
//
// Wired into package.json:  "dev": "npx live-server --middleware=./scripts/dev-rewrite.js"

module.exports = function rewrite(req, res, next) {
  const [pathname, query] = req.url.split('?');
  const qs = query ? '?' + query : '';

  // Direct page rewrites (matches vercel.json)
  const map = {
    '/submit':           '/submit.html',
    '/pricing':          '/pricing.html',
    '/featured':         '/featured.html',
    '/dashboard':        '/dashboard.html',
    '/success':          '/success.html',
    '/payment-success':  '/payment-success.html',
  };

  if (Object.prototype.hasOwnProperty.call(map, pathname)) {
    req.url = map[pathname] + qs;
    return next();
  }

  // SPA fallbacks served by index.html
  const isSpaRoute =
    pathname === '/blog' ||
    pathname.startsWith('/blog/') ||
    pathname.startsWith('/startup/');

  if (isSpaRoute) {
    // Don't rewrite if the request already has a file extension (e.g. /blog/images/foo.png)
    const hasExt = /\.[a-z0-9]+$/i.test(pathname);
    if (!hasExt) {
      req.url = '/index.html' + qs;
    }
  }

  next();
};
