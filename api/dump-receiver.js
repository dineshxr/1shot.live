// TEMPORARY: receiver for the one-off Supabase → R2 database dump performed
// while the Supabase data plane is egress-restricted (pg_net can POST but not
// PUT, so it can't hit presigned S3 URLs directly). Guarded by DUMP_SECRET.
// Delete this file once the dump is verified.
import { r2Fetch } from '../src/server/r2.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const secret = req.headers['x-dump-secret'];
  if (!process.env.DUMP_SECRET || secret !== process.env.DUMP_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const name = String((req.query && req.query.name) || '');
  if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
    res.status(400).json({ error: 'Bad name' });
    return;
  }
  try {
    const body = Buffer.from(JSON.stringify(req.body ?? null));
    const put = await r2Fetch('PUT', `db-dump-20260814/${name}.json`, { body, contentType: 'application/json' });
    if (!put.ok) throw new Error(`R2 put failed: ${put.status}`);
    res.status(200).json({ ok: true, name, bytes: body.length });
  } catch (e) {
    console.error('dump-receiver error:', e);
    res.status(500).json({ error: 'Store failed' });
  }
}
