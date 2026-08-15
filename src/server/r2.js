// Minimal Cloudflare R2 (S3-compatible) client for Vercel functions.
// Hand-rolled AWS SigV4 so we need zero npm dependencies (node_modules is
// partially committed in this repo; keeping the tree clean beats an SDK).
// Lives outside api/ so the "api/**/*.js" build glob doesn't make it a route.
import { createHash, createHmac } from 'node:crypto';

export const R2_BUCKET = process.env.R2_BUCKET || 'submithunt-assets';

// Only keys under this prefix are ever exposed through /img — the bucket also
// holds private db-dump snapshots.
export const PUBLIC_PREFIX = 'submissions/';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

// Signed fetch for a single object. method: 'GET' | 'PUT' | 'HEAD' | 'DELETE'.
// opts: { body?: Buffer, contentType?: string, cacheControl?: string }
export async function r2Fetch(method, key, opts = {}) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKey || !secretKey) throw new Error('R2 credentials not configured');

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${R2_BUCKET}/${encodeKey(key)}`;
  const body = opts.body || Buffer.alloc(0);
  const payloadHash = sha256(body);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  let signingKey = hmac(`AWS4${secretKey}`, dateStamp);
  for (const part of ['auto', 's3', 'aws4_request']) signingKey = hmac(signingKey, part);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const headers = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (opts.contentType) headers['content-type'] = opts.contentType;
  if (opts.cacheControl) headers['cache-control'] = opts.cacheControl;

  return fetch(`https://${host}${canonicalUri}`, {
    method,
    headers,
    body: method === 'PUT' || method === 'POST' ? body : undefined,
  });
}
