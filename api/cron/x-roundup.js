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
//    Paid launches (premium / featured) get a starred shout-out line first.
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

// Paid launches (premium / featured, payment_status = paid) get a starred
// shout-out line each, listed first; free launches follow after a blank line.
const PAID_LABEL = { featured: '🏆 Featured', premium: '⭐ Premium' };
const isPaid = (s) => Boolean(PAID_LABEL[s.plan]) && s.payment_status === 'paid';

// Fit the roundup into one tweet. Space is reclaimed in this order: free
// taglines shrink then drop, paid taglines shrink then drop, footer goes,
// titles shorten, and finally free launches fall off the end as "+N more".
// Paid launches are never dropped. Line structure is always preserved.
export function compose(launches) {
  const items = sortLaunches(launches).map((s) => ({
    paid: isPaid(s), label: PAID_LABEL[s.plan], handle: xHandle(s),
    title: clean(s.title), tagline: clean(s.tagline),
  }));
  const paid = items.filter((it) => it.paid);
  const free = items.filter((it) => !it.paid);
  const total = launches.length;

  const line = (it, cap, titleMax) => {
    const title = truncate(it.title, titleMax);
    const who = it.handle ? `@${it.handle} – ${title}` : title;
    const tag = cap && it.tagline ? `: ${truncate(it.tagline, cap)}` : '';
    return (it.paid ? `${it.label}: ` : '') + who + tag;
  };
  const build = (freeItems, capPaid, capFree, footer, titleMax, dropped = 0) => {
    const sections = [];
    if (paid.length) sections.push(paid.map((it) => line(it, capPaid, titleMax)).join('\n'));
    const freeLines = freeItems.map((it) => line(it, capFree, titleMax));
    if (dropped) freeLines.push(`+${dropped} more`);
    if (freeLines.length) sections.push(freeLines.join('\n'));
    return `${header(total)}\n\n${sections.join('\n\n')}${footer ? `\n\n${FOOTER}` : ''}`;
  };
  const fits = (text) => text.length <= MAX_TWEET;

  // Tagline caps step down to 15 and then straight to 0: a shorter stub
  // ("A ta…") reads worse than no tagline at all.
  const CAPS_FREE = [45, 40, 35, 30, 25, 20, 15, 0];
  const CAPS_PAID = [60, 50, 40, 30, 20, 15, 0];
  for (const cap of CAPS_FREE) {
    const text = build(free, 60, cap, true, 30);
    if (fits(text)) return text;
  }
  for (const cap of CAPS_PAID) {
    const text = build(free, cap, 0, true, 30);
    if (fits(text)) return text;
  }
  for (const titleMax of [30, 22]) {
    const text = build(free, 0, 0, false, titleMax);
    if (fits(text)) return text;
  }
  for (let keep = free.length - 1; keep >= 0; keep -= 1) {
    const text = build(free.slice(0, keep), 0, 0, false, 22, free.length - keep);
    if (fits(text)) return text;
  }
  return truncate(header(total), MAX_TWEET);
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
