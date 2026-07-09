// server/services/ai/gamificationService.js
// ============================================
// Gamification: logging streaks, lifetime stats, and bilingual achievements.
// ============================================
// Pure, deterministic computation over entry timestamps — no model, no DB calls
// here (the route supplies the rows). Drives the dashboard's motivational layer:
// a current/longest streak, active days, and unlockable badges (EN + AR) that
// reward cross-domain, consistent logging. Graduation-grade interactivity that
// stays reliable and testable.

// UTC day keys — must match sameDayCoverage / longHorizon or streaks flip at
// local midnight while digs still use UTC (off-by-one for non-UTC users).
const dayKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};
const addDays = (value, n) => {
  const d = new Date(value);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

/**
 * Consecutive-day logging streak from a list of timestamps.
 * @returns {{current:number,longest:number,active_days:number,last_active:string|null}}
 */
const computeStreak = (dates = [], today = new Date()) => {
  const set = new Set((dates || []).map(dayKey).filter(Boolean));
  const activeDays = set.size;
  if (!activeDays) return { current: 0, longest: 0, active_days: 0, last_active: null };

  // Current streak: anchor at today if logged, else yesterday (today not over),
  // then walk backwards while each prior day is present.
  let cursor = set.has(dayKey(today)) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest run across all active days.
  const sorted = [...set].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (dayKey(addDays(new Date(sorted[i - 1]), 1)) === sorted[i]) run += 1;
    else run = 1;
    if (run > longest) longest = run;
  }
  return { current, longest, active_days: activeDays, last_active: sorted[sorted.length - 1] };
};

// Achievement catalog — bilingual, ordered by ascending difficulty.
const ACHIEVEMENTS = [
  { id: 'first_log', title: 'First step', title_ar: 'أول خطوة', icon: '🌱', test: (s) => s.total >= 1 },
  { id: 'cross_domain', title: 'Both sides', title_ar: 'الجانبان معًا', icon: '🔗', test: (s) => s.health >= 1 && s.finance >= 1 },
  { id: 'streak_3', title: '3-day streak', title_ar: '٣ أيام متتالية', icon: '🔥', test: (s) => s.streak.current >= 3 || s.streak.longest >= 3 },
  { id: 'logs_25', title: 'Getting consistent', title_ar: 'أصبحت منتظمًا', icon: '📈', test: (s) => s.total >= 25 },
  { id: 'streak_7', title: 'Full week', title_ar: 'أسبوع كامل', icon: '🏆', test: (s) => s.streak.current >= 7 || s.streak.longest >= 7 },
  { id: 'saver', title: 'In the green', title_ar: 'في المنطقة الخضراء', icon: '💰', test: (s) => s.net > 0 },
  { id: 'logs_100', title: '100 logs', title_ar: '١٠٠ تسجيل', icon: '💯', test: (s) => s.total >= 100 },
];

/** Evaluate which achievements are unlocked for the given stats. */
const computeAchievements = (stats) => ACHIEVEMENTS.map((a) => ({
  id: a.id,
  title: a.title,
  title_ar: a.title_ar,
  icon: a.icon,
  unlocked: Boolean(a.test(stats)),
}));

/**
 * Full gamification snapshot from health + finance rows (each row has logged_at;
 * finance rows have type/amount).
 */
const buildGamification = (healthRows = [], financeRows = [], today = new Date()) => {
  const allDates = [
    ...healthRows.map((r) => r.logged_at),
    ...financeRows.map((r) => r.logged_at),
  ].filter(Boolean);
  const streak = computeStreak(allDates, today);
  const net = financeRows.reduce((acc, r) => {
    const amt = Number(r.amount) || 0;
    return acc + (r.type === 'income' ? amt : -amt);
  }, 0);
  const stats = {
    total: healthRows.length + financeRows.length,
    health: healthRows.length,
    finance: financeRows.length,
    net: Math.round(net * 100) / 100,
    streak,
  };
  const achievements = computeAchievements(stats);
  return {
    streak,
    stats: { total: stats.total, health: stats.health, finance: stats.finance, net: stats.net },
    achievements,
    unlocked_count: achievements.filter((a) => a.unlocked).length,
  };
};

module.exports = {
  computeStreak,
  computeAchievements,
  buildGamification,
  _ACHIEVEMENTS: ACHIEVEMENTS,
};
