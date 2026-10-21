// Digital wellbeing: a private, on-device log of how the app is used (time on
// screen + what was done), shown in the "Your activity" panel. Nothing is sent
// anywhere. Days older than KEEP_DAYS are dropped.

export type ActivityKind = 'photo' | 'bg' | 'export' | 'signature';

export type DayActivity = { secs: number } & Record<ActivityKind, number>;

export interface ActivityLog {
  days: Record<string, DayActivity>;
  recent: { t: number; kind: ActivityKind; n: number }[];
}

const KEY = 'activity-log';
const KEEP_DAYS = 30;
const KEEP_RECENT = 30;
const TICK_SECS = 15;

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const emptyDay = (): DayActivity => ({ secs: 0, photo: 0, bg: 0, export: 0, signature: 0 });

export function readActivity(): ActivityLog {
  try {
    const log = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (log && typeof log.days === 'object' && Array.isArray(log.recent)) return log;
  } catch {
    /* nothing saved yet, or storage blocked */
  }
  return { days: {}, recent: [] };
}

function update(fn: (today: DayActivity, log: ActivityLog) => void) {
  const log = readActivity();
  const now = new Date();
  fn((log.days[dayKey(now)] = { ...emptyDay(), ...log.days[dayKey(now)] }), log);
  const oldest = dayKey(new Date(now.getTime() - KEEP_DAYS * 864e5));
  for (const k of Object.keys(log.days)) if (k < oldest) delete log.days[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    /* storage full or blocked: skip this entry */
  }
}

export function logActivity(kind: ActivityKind, n = 1) {
  update((today, log) => {
    today[kind] += n;
    log.recent = [{ t: Date.now(), kind, n }, ...log.recent].slice(0, KEEP_RECENT);
  });
}

export function clearActivity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

// Counts time while the app is on screen. Returns a stop function.
// ponytail: counts in 15 s ticks while the page is visible (not focused), so a
// window left open behind others still counts; use focus/blur if that matters.
export function trackScreenTime(): () => void {
  const id = setInterval(() => {
    if (document.visibilityState === 'visible') update((today) => (today.secs += TICK_SECS));
  }, TICK_SECS * 1000);
  return () => clearInterval(id);
}

// The last 7 days (oldest first) plus totals, for the activity panel.
export function summarize(log: ActivityLog, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { date: d, ...emptyDay(), ...log.days[dayKey(d)] };
  });
  const week = days.reduce((sum, d) => {
    for (const k of Object.keys(sum) as (keyof DayActivity)[]) sum[k] += d[k];
    return sum;
  }, emptyDay());
  const activeDays = days.filter((d) => d.secs > 0).length;
  return { days, today: days[6], week, dailyAvgSecs: activeDays ? Math.round(week.secs / activeDays) : 0 };
}

export function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
