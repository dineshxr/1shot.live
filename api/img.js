// Public image proxy: /img/<key> (rewritten to /api/img.js?key=<key>).
// Streams objects from the private R2 bucket with immutable cache headers so
// Vercel's CDN serves repeat traffic and R2 is hit ~once per file per region.
import { r2Fetch, PUBLIC_PREFIX, IMMUTABLE_CACHE } from '../src/server/r2.js';

export default async function handler(req, res) {
  const key = String((req.query && req.query.key) || '');
  if (!key.startsWith(PUBLIC_PREFIX) || key.includes('..')) {
    res.status(404).send('Not found');
    return;
  }
  try {
    const obj = await r2Fetch('GET', key);
    if (!obj.ok) {
      // Cache misses briefly so a missing file can't hammer R2, but recovers
      // fast once the object is backfilled.
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(obj.status === 404 ? 404 : 502).send('Not found');
      return;
    }
    const body = Buffer.from(await obj.arrayBuffer());
    res.setHeader('Cache-Control', IMMUTABLE_CACHE);
    res.setHeader('Content-Type', obj.headers.get('content-type') || 'application/octet-stream');
    const etag = obj.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(body);
  } catch (e) {
    console.error('img proxy error:', e);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(502).send('Image fetch failed');
  }
}
