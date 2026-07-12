// Pure ISO week window helpers — shared by report + insight engine

const {
  isoWeekKey,
  weekBoundsUtc,
  isoWeekQueryWindows,
  localCalendarDateUtc,
  weekBoundsForTimeZone,
  isValidIanaTimeZone,
} = require('../server/utils/isoWeek');

describe('isoWeek', () => {
  test('isoWeekKey + weekBoundsUtc Mon–Sun UTC', () => {
    const at = new Date('2026-07-11T12:00:00Z'); // Saturday
    expect(isoWeekKey(at)).toBe('2026-W28');
    const b = weekBoundsUtc(at);
    expect(b).toEqual({
      period_start: '2026-07-06',
      period_end: '2026-07-12',
      week_key: '2026-W28',
    });
  });

  test('isoWeekQueryWindows: this week + previous Mon–Sun half-open ranges', () => {
    const at = new Date('2026-07-11T12:00:00Z');
    const w = isoWeekQueryWindows(at);
    expect(w.period_start).toBe('2026-07-06');
    expect(w.period_end).toBe('2026-07-12');
    expect(w.start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(w.endExclusive.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(w.prevStart.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(w.prevEnd.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    // period.end date-only is Sunday (same as period_end)
    expect(w.period.start.toISOString().slice(0, 10)).toBe('2026-07-06');
    expect(w.period.end.toISOString().slice(0, 10)).toBe('2026-07-12');
  });

  test('isValidIanaTimeZone', () => {
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Asia/Hebron')).toBe(true);
    expect(isValidIanaTimeZone('Not/AZone')).toBe(false);
    expect(isValidIanaTimeZone('')).toBe(false);
  });

  test('local calendar day crosses week boundary east of UTC', () => {
    // Sunday 22:00 UTC 12 Jul 2026 = Monday 01:00 Asia/Hebron → local Mon 13 Jul → week 29
    const at = new Date('2026-07-12T22:00:00Z');
    expect(isoWeekKey(at)).toBe('2026-W28'); // still Sunday UTC
    const local = localCalendarDateUtc(at, 'Asia/Hebron');
    expect(local.toISOString().slice(0, 10)).toBe('2026-07-13');
    const hebron = weekBoundsForTimeZone(at, 'Asia/Hebron');
    expect(hebron.week_key).toBe('2026-W29');
    expect(hebron.period_start).toBe('2026-07-13');
    expect(hebron.period_end).toBe('2026-07-19');
    // UTC zone stays on W28
    expect(weekBoundsForTimeZone(at, 'UTC').week_key).toBe('2026-W28');
  });

  test('invalid timezone falls back to UTC', () => {
    const at = new Date('2026-07-12T22:00:00Z');
    const b = weekBoundsForTimeZone(at, 'Fake/Zone');
    expect(b.timezone).toBe('UTC');
    expect(b.week_key).toBe('2026-W28');
  });
});
