// tests/gamification.test.js
const { computeStreak, buildGamification, computeAchievements } = require('../server/services/ai/gamificationService');

// Fixed UTC anchor so streak math is deterministic in any local TZ.
const TODAY = new Date('2026-06-30T12:00:00.000Z');
const day = (offset) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
};

describe('computeStreak', () => {
  test('no entries → zero streak', () => {
    expect(computeStreak([], TODAY)).toMatchObject({ current: 0, longest: 0, active_days: 0 });
  });

  test('today + two prior days → current streak 3', () => {
    const s = computeStreak([day(0), day(-1), day(-2)], TODAY);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.active_days).toBe(3);
  });

  test('anchors at yesterday when today not yet logged', () => {
    const s = computeStreak([day(-1), day(-2)], TODAY);
    expect(s.current).toBe(2);
  });

  test('a gap breaks the current streak but longest survives', () => {
    // logged today, then a gap at -1, then 3 in a row earlier
    const s = computeStreak([day(0), day(-3), day(-4), day(-5)], TODAY);
    expect(s.current).toBe(1);   // only today
    expect(s.longest).toBe(3);   // the -3..-5 run
  });

  test('duplicate same-day timestamps count once', () => {
    const s = computeStreak([day(0), day(0), day(0)], TODAY);
    expect(s.active_days).toBe(1);
    expect(s.current).toBe(1);
  });

  test('UTC day boundary: 23:59Z and 00:01Z are different days', () => {
    const late = '2026-06-29T23:59:00.000Z';
    const early = '2026-06-30T00:01:00.000Z';
    const s = computeStreak([late, early], new Date('2026-06-30T12:00:00.000Z'));
    expect(s.active_days).toBe(2);
    expect(s.current).toBe(2);
  });

  test('month boundary: Jun 30 + Jul 1 streak holds', () => {
    const s = computeStreak(
      ['2026-06-30T10:00:00.000Z', '2026-07-01T10:00:00.000Z'],
      new Date('2026-07-01T15:00:00.000Z'),
    );
    expect(s.current).toBe(2);
  });
});

describe('buildGamification', () => {
  const health = [{ logged_at: day(0) }, { logged_at: day(-1) }];
  const finance = [{ logged_at: day(0), type: 'income', amount: 100 }, { logged_at: day(-1), type: 'expense', amount: 30 }];

  test('aggregates stats + net', () => {
    const g = buildGamification(health, finance, TODAY);
    expect(g.stats).toMatchObject({ total: 4, health: 2, finance: 2, net: 70 });
    expect(g.streak.current).toBe(2);
  });

  test('unlocks first_log + cross_domain + saver', () => {
    const g = buildGamification(health, finance, TODAY);
    const unlocked = g.achievements.filter((a) => a.unlocked).map((a) => a.id);
    expect(unlocked).toEqual(expect.arrayContaining(['first_log', 'cross_domain', 'saver']));
    expect(g.unlocked_count).toBeGreaterThanOrEqual(3);
  });

  test('achievements are bilingual', () => {
    const a = computeAchievements({ total: 1, health: 1, finance: 0, net: 0, streak: { current: 0, longest: 0 } });
    const first = a.find((x) => x.id === 'first_log');
    expect(first.title).toBe('First step');
    expect(first.title_ar).toMatch(/[؀-ۿ]/);
  });

  test('empty user has no unlocked achievements', () => {
    const g = buildGamification([], [], TODAY);
    expect(g.unlocked_count).toBe(0);
  });
});
