/**
 * Test for the weekday check logic in send-live-notifications.
 * Verifies that launch_date day-of-week is calculated correctly
 * without timezone-induced day shifting.
 *
 * Run: node supabase/functions/send-live-notifications/weekday-check.test.mjs
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
