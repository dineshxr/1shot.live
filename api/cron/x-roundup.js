// Daily launch roundup on X (@submithunt) — Vercel Cron, weekdays 16:15 UTC
// (09:15 PT in summer, 08:15 PT in winter). Replaces the ad-hoc poster that
// skipped days (no post on 2026-09-10/11/16/17 despite launches).
//
//   GET /api/cron/x-roundup            Vercel sends  Authorization: Bearer $CRON_SECRET
//   GET /api/cron/x-roundup?dry_run=1  composes the post, publishes nothing
//
// 1. Loads today's (America/Los_Angeles) live launches from Supabase.
// 2. Skips when there are none, or when a roundup for today already exists on
//    Post Bridge — so nothing double-posts if another poster fires first.
// 3. Publishes immediately through Post Bridge to @submithunt on X, with the
//    site link in the first comment (X strips links from the tweet body).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POST_BRIDGE_API_KEY, CRON_SECRET.

const POST_BRIDGE_API = 'https://api.post-bridge.com/v1';
const X_ACCOUNT_ID = 75728;          // Post Bridge id of @submithunt on X — never another account
const SITE_URL = 'https://www.submithunt.com';
const MAX_TWEET = 275;               // X's 280 with a little slack
const FOOTER = 'Congrats! 🎉';
const FIRST_COMMENT = `See all of today's launches → ${SITE_URL}`;
const ROUNDUP_RE = /launch(?:es)? on submit ?hunt today|submithunt launches/i;

const header = (n) => `${n} launch${n === 1 ? '' : 'es'} on Submit Hunt today:`;

// YYYY-MM-DD for the site's launch-day timezone.
function todayInLA() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

// Cut at a word boundary and add an ellipsis; never longer than max.
function truncate(str, max) {
  const s = clean(str);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return cut.slice(0, at > max * 0.6 ? at : cut.length).trim() + '…';
}

// X handle from the maker's explicit profile link only (author.name is often
// a company or a domain, which would render as a bogus @mention).
function xHandle(s) {
  for (const raw of [s?.author?.profile_url, s?.details?.socialLinks?.x]) {
    const m = String(raw || '').match(/(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
    if (m && !/^(?:home|i|intent|share|search|hashtag|explore)$/i.test(m[1])) return m[1];
  }
  return '';
}

// featured → premium → free, then submission order.
function sortLaunches(rows) {
  const rank = { featured: 0, premium: 1, free: 2 };
  return [...rows].sort((a, b) =>
    (rank[a.plan] ?? 3) - (rank[b.plan] ?? 3) || String(a.created_at).localeCompare(String(b.created_at)));
}

// Fit the roundup into one tweet: shorten taglines, then drop them, then the
// footer, then shorten titles, and finally list fewer makers with "+N more".
// Never flattens the line structure.
export function compose(launches) {
  const build = (items, cap, footer, titleMax) => {
    const lines = items.map((it) => {
      const title = truncate(it.title, titleMax);
      const who = it.handle ? `@${it.handle} – ${title}` : title;
      return who + (cap && it.tagline ? `: ${truncate(it.tagline, cap)}` : '');
    });
    return `${header(launches.length)}\n\n${lines.join('\n')}${footer ? `\n\n${FOOTER}` : ''}`;
  };
  const items = launches.map((s) => ({ handle: xHandle(s), title: clean(s.title), tagline: clean(s.tagline) }));
  for (let cap = 45; cap >= 0; cap -= 5) {
    const text = build(items, cap, true, 30);
    if (text.length <= MAX_TWEET) return text;
  }
  for (const titleMax of [30, 22]) {
    const text = build(items, 0, false, titleMax);
    if (text.length <= MAX_TWEET) return text;
  }
  for (let keep = items.length - 1; keep >= 1; keep -= 1) {
    const text = `${build(items.slice(0, keep), 0, false, 22)}\n+${items.length - keep} more`;
    if (text.length <= MAX_TWEET) return text;
  }
  return truncate(header(launches.length), MAX_TWEET);
}

async function loadLaunches(day) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const base = process.env.SUPABASE_URL || '';
  if (!key || !base) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
  const url = new URL(`${base}/rest/v1/startups`);
  url.searchParams.set('select', 'id,title,slug,tagline,url,plan,payment_status,author,details,created_at');
  url.searchParams.set('launch_date', `eq.${day}`);
  url.searchParams.set('is_live', 'eq.true');
  url.searchParams.set('archived', 'eq.false');
  url.searchParams.set('or', '(plan.eq.free,payment_status.eq.paid)');
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.json();
}

// A roundup created today (UTC) for the X account, in any state.
async function existingRoundupToday(apiKey) {
  const today = new Date().toISOString().slice(0, 10);
  for (const status of ['posted', 'processing', 'scheduled']) {
    const res = await fetch(`${POST_BRIDGE_API}/posts?platform=twitter&status=${status}&limit=25`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Post Bridge list (${status}) ${res.status}`);
    const { data = [] } = await res.json();
    const hit = data.find((p) => (p.social_accounts || []).includes(X_ACCOUNT_ID)
      && ROUNDUP_RE.test(p.caption || '') && String(p.created_at || '').startsWith(today));
    if (hit) return hit;
  }
  return null;
}

async function publish(apiKey, caption) {
  const res = await fetch(`${POST_BRIDGE_API}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caption,
      social_accounts: [X_ACCOUNT_ID],
      platform_configurations: { twitter: { first_comment: FIRST_COMMENT } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Post Bridge create ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret || (req.headers.authorization || '').trim() !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const dryRun = String(req.query?.dry_run || '') === '1';
  const day = todayInLA();
  try {
    const launches = sortLaunches(await loadLaunches(day));
    if (!launches.length) return res.status(200).json({ ok: true, day, skipped: 'no launches today' });
    const caption = compose(launches);
    if (dryRun) {
      return res.status(200).json({ ok: true, day, dry_run: true, count: launches.length, caption, first_comment: FIRST_COMMENT });
    }
    const pbKey = (process.env.POST_BRIDGE_API_KEY || '').trim();
    if (!pbKey) return res.status(500).json({ error: 'POST_BRIDGE_API_KEY is not set', day, caption });
    const existing = await existingRoundupToday(pbKey);
    if (existing) return res.status(200).json({ ok: true, day, skipped: 'roundup already posted today', post_id: existing.id });
    const created = await publish(pbKey, caption);
    const post = created?.data ?? created;
    console.log(`x-roundup: posted ${launches.length} launches for ${day} (post ${post?.id || '?'})`);
    return res.status(200).json({ ok: true, day, count: launches.length, caption, post_id: post?.id });
  } catch (err) {
    console.error('x-roundup failed:', err);
    return res.status(500).json({ error: String(err?.message || err), day });
  }
}
