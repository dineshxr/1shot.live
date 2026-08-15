// Submission asset uploads (logo / cover / screenshot) to Cloudflare R2.
// Replaces the old direct-from-browser Supabase Storage uploads. Clients
// compress before uploading (see src/lib/upload-client.js); this endpoint
// validates and stores under the same submissions/<kind>-<ts>-<rand>.<ext>
// key scheme the site has always used.
import { r2Fetch, PUBLIC_PREFIX, IMMUTABLE_CACHE } from '../src/server/r2.js';

const SITE = 'https://www.submithunt.com';
const MAX_BYTES = 2.5 * 1024 * 1024; // post-compression cap
const KINDS = new Set(['logo', 'cover', 'screenshot']);
const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function magicBytesMatch(buf, mime) {
  if (buf.length < 12) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/gif') return buf.slice(0, 4).toString('ascii') === 'GIF8';
  if (mime === 'image/webp') return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { kind, contentType, dataBase64 } = req.body || {};
    if (!KINDS.has(kind)) {
      res.status(400).json({ error: 'Invalid kind' });
      return;
    }
    const ext = EXT_BY_MIME[contentType];
    if (!ext || typeof dataBase64 !== 'string') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }
    const buf = Buffer.from(dataBase64, 'base64');
    if (!buf.length || buf.length > MAX_BYTES) {
      res.status(413).json({ error: 'Image too large (max 2.5MB after compression)' });
      return;
    }
    if (!magicBytesMatch(buf, contentType)) {
      res.status(400).json({ error: 'File content does not match its type' });
      return;
    }
    const key = `${PUBLIC_PREFIX}${kind}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const put = await r2Fetch('PUT', key, { body: buf, contentType, cacheControl: IMMUTABLE_CACHE });
    if (!put.ok) throw new Error(`R2 put failed: ${put.status}`);
    res.status(200).json({ url: `${SITE}/img/${key}` });
  } catch (e) {
    console.error('upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
}
