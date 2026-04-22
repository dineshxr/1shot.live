/**
 * Tests for the send-live-notifications edge function logic.
 * Covers:
 * 1. Weekday check: launch_date day-of-week calculated correctly (no timezone shift)
 * 2. Startup filtering: simulates which startups should be processed
 * 3. Retry logic: verifies missed notifications are picked up
 *
 * Run: TZ=UTC node --test supabase/functions/send-live-notifications/weekday-check.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ── Fixed logic (from the current code) ──────────────────────────
function getWeekdayFixed(launchDate) {
  const [year, month, day] = launchDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay(); // 0=Sun … 6=Sat
}

// ── Old buggy logic (before the fix) ─────────────────────────────
function getWeekdayBuggy(launchDate) {
  const [year, month, day] = launchDate.split('-').map(Number);
  const date = new Date(year, month - 1, day); // midnight local (UTC on server)
  const pstWeekdayString = date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
  });
  const weekdayMap = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  return weekdayMap[pstWeekdayString] ?? -1;
}

function isWeekday(dow) {
  return dow >= 1 && dow <= 5;
}

// Known dates and their actual day of week
const testCases = [
  { date: '2026-03-23', expectedDow: 1, day: 'Monday' },
  { date: '2026-03-24', expectedDow: 2, day: 'Tuesday' },
  { date: '2026-03-25', expectedDow: 3, day: 'Wednesday' },
  { date: '2026-03-26', expectedDow: 4, day: 'Thursday' },
  { date: '2026-03-27', expectedDow: 5, day: 'Friday' },
  { date: '2026-03-28', expectedDow: 6, day: 'Saturday' },
  { date: '2026-03-29', expectedDow: 0, day: 'Sunday' },
];

describe('weekday check (fixed logic)', () => {
  for (const { date, expectedDow, day } of testCases) {
    it(`${date} is ${day} (dow=${expectedDow})`, () => {
      assert.equal(getWeekdayFixed(date), expectedDow);
    });
  }

  it('Mon-Fri are weekdays, Sat-Sun are not', () => {
    assert.equal(isWeekday(getWeekdayFixed('2026-03-23')), true);  // Mon
    assert.equal(isWeekday(getWeekdayFixed('2026-03-27')), true);  // Fri
    assert.equal(isWeekday(getWeekdayFixed('2026-03-28')), false); // Sat
    assert.equal(isWeekday(getWeekdayFixed('2026-03-29')), false); // Sun
  });
});

describe('old buggy logic produces wrong day for Monday', () => {
  it('Monday launch_date is seen as Sunday by the old code', () => {
    const buggyDow = getWeekdayBuggy('2026-03-23'); // actual Monday
    // On a UTC server, midnight UTC → PST = previous day (Sunday)
    assert.equal(buggyDow, 0, 'buggy code sees Monday as Sunday');
    assert.equal(isWeekday(buggyDow), false, 'buggy code would skip Monday launches');
  });

  it('fixed code correctly identifies Monday', () => {
    assert.equal(getWeekdayFixed('2026-03-23'), 1);
    assert.equal(isWeekday(getWeekdayFixed('2026-03-23')), true);
  });
});

describe('old buggy logic incorrectly allows Saturday', () => {
  it('Saturday launch_date is seen as Friday by the old code', () => {
    const buggyDow = getWeekdayBuggy('2026-03-28'); // actual Saturday
    assert.equal(buggyDow, 5, 'buggy code sees Saturday as Friday');
    assert.equal(isWeekday(buggyDow), true, 'buggy code would incorrectly process Saturday');
  });

  it('fixed code correctly identifies Saturday as non-weekday', () => {
    assert.equal(getWeekdayFixed('2026-03-28'), 6);
    assert.equal(isWeekday(getWeekdayFixed('2026-03-28')), false);
  });
});

// ── Simulate the full startup filtering logic ────────────────────
function shouldGoLive(startup, currentHour) {
  if (startup.plan === 'premium' || startup.plan === 'featured') return true;
  if (currentHour < 8) return false;
  if (!startup.launch_date) return false;
  const [year, month, day] = startup.launch_date.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  return dow >= 1 && dow <= 5;
}

describe('startup filtering logic', () => {
  it('paid startups go live regardless of time or launch_date', () => {
    assert.equal(shouldGoLive({ plan: 'premium', launch_date: null }, 3), true);
    assert.equal(shouldGoLive({ plan: 'featured', launch_date: '2026-03-29' }, 3), true); // Sunday, 3 AM
  });

  it('free startups are blocked before 8 AM PST', () => {
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-24' }, 7), false); // Tuesday, 7 AM
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-24' }, 8), true);  // Tuesday, 8 AM
  });

  it('free startups with null launch_date are skipped', () => {
    assert.equal(shouldGoLive({ plan: 'free', launch_date: null }, 10), false);
  });

  it('free startups on weekends are skipped', () => {
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-28' }, 10), false); // Sat
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-29' }, 10), false); // Sun
  });

  it('free startups on weekdays after 8 AM are processed', () => {
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-23' }, 10), true); // Mon
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-24' }, 10), true); // Tue
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-25' }, 10), true); // Wed
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-26' }, 10), true); // Thu
    assert.equal(shouldGoLive({ plan: 'free', launch_date: '2026-03-27' }, 10), true); // Fri
  });
});

// ── Retry logic simulation ───────────────────────────────────────
// Simulates the scenario where a startup went live today but email failed,
// and verifies the retry query picks it up (only today's launches, not backlog).

describe('missed notification retry logic (today only)', () => {
  const today = '2026-04-22';
  const yesterday = '2026-04-21';

  const dbStartups = [
    { id: '1', title: 'A', is_live: true,  notification_sent: true,  launch_date: today,     author: { email: 'a@test.com' } },
    { id: '2', title: 'B', is_live: true,  notification_sent: false, launch_date: today,     author: { email: 'b@test.com' } }, // today, missed → retry
    { id: '3', title: 'C', is_live: false, notification_sent: false, launch_date: today,     author: { email: 'c@test.com' } },
    { id: '4', title: 'D', is_live: true,  notification_sent: false, launch_date: today,     author: { email: null } },
    { id: '5', title: 'E', is_live: true,  notification_sent: false, launch_date: today,     author: {} },
    { id: '6', title: 'F', is_live: true,  notification_sent: false, launch_date: today,     author: { email: 'f@test.com' } }, // today, missed → retry
    { id: '7', title: 'G', is_live: true,  notification_sent: false, launch_date: yesterday, author: { email: 'g@test.com' } }, // old backlog → skip
    { id: '8', title: 'H', is_live: true,  notification_sent: false, launch_date: '2026-03-01', author: { email: 'h@test.com' } }, // old backlog → skip
  ];

  // Simulate the retry query: is_live=true, notification_sent=false,
  // launch_date >= today, author.email is not null
  function getMissedNotifications(startups, todayPst) {
    return startups.filter(s =>
      s.is_live === true &&
      s.notification_sent === false &&
      s.launch_date >= todayPst &&
      s.author?.email != null && s.author?.email !== ''
    );
  }

  it('finds only today\'s startups that missed email notification', () => {
    const missed = getMissedNotifications(dbStartups, today);
    assert.equal(missed.length, 2);
    assert.equal(missed[0].id, '2');
    assert.equal(missed[1].id, '6');
  });

  it('excludes old backlog startups even if notification was missed', () => {
    const missed = getMissedNotifications(dbStartups, today);
    assert.ok(!missed.find(s => s.id === '7'), 'should not retry yesterday\'s missed startup');
    assert.ok(!missed.find(s => s.id === '8'), 'should not retry old backlog startup');
  });

  it('excludes startups that already received notification', () => {
    const missed = getMissedNotifications(dbStartups, today);
    assert.ok(!missed.find(s => s.id === '1'));
  });

  it('excludes startups that are not yet live', () => {
    const missed = getMissedNotifications(dbStartups, today);
    assert.ok(!missed.find(s => s.id === '3'));
  });

  it('excludes startups with no author email', () => {
    const missed = getMissedNotifications(dbStartups, today);
    assert.ok(!missed.find(s => s.id === '4'));
    assert.ok(!missed.find(s => s.id === '5'));
  });
});
