// Self-check for lib/activity.ts (run with `npm test`).
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { logActivity, readActivity, summarize, clearActivity, dayKey, formatDuration } = await import('../lib/activity.ts');

logActivity('photo');
logActivity('photo', 3);
logActivity('export');
let log = readActivity();
assert.equal(log.days[dayKey(new Date())].photo, 4);
assert.equal(log.recent[0].kind, 'export');

// Old and future-dated days: summary covers exactly the last 7 days.
const now = new Date(2026, 9, 21, 12);
log = {
  recent: [],
  days: {
    [dayKey(new Date(2026, 9, 21))]: { secs: 600, photo: 1, bg: 0, export: 1, signature: 0 },
    [dayKey(new Date(2026, 9, 15))]: { secs: 1200, photo: 2 }, // older entry missing fields
    [dayKey(new Date(2026, 9, 14))]: { secs: 9999, photo: 9, bg: 9, export: 9, signature: 9 }, // 8 days ago
  },
};
const s = summarize(log, now);
assert.equal(s.days.length, 7);
assert.equal(s.today.secs, 600);
assert.equal(s.week.secs, 1800);
assert.equal(s.week.photo, 3);
assert.equal(s.week.bg, 0);
assert.equal(s.dailyAvgSecs, 900);

assert.equal(formatDuration(59), '0m');
assert.equal(formatDuration(3900), '1h 5m');

clearActivity();
assert.deepEqual(readActivity(), { days: {}, recent: [] });
console.log('  ✓ activity log');
