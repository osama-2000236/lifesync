// sameDayCoverage + buildDataGaps same-day contract
const {
  isSameUtcDay,
  coverageFromContext,
  startOfUtcDay,
} = require('../server/services/ai/sameDayCoverage');
const { _buildDataGaps } = require('../server/services/ai/conversationService');

describe('sameDayCoverage', () => {
  test('isSameUtcDay true for timestamps after UTC midnight', () => {
    const now = new Date('2026-07-09T15:00:00.000Z');
    expect(isSameUtcDay('2026-07-09T01:00:00.000Z', now)).toBe(true);
    expect(isSameUtcDay('2026-07-08T23:00:00.000Z', now)).toBe(false);
    expect(isSameUtcDay(null, now)).toBe(false);
  });

  test('coverageFromContext only counts today rows + this_turn_entities', () => {
    const now = new Date('2026-07-09T12:00:00.000Z');
    const cov = coverageFromContext({
      recent_health_entries: [
        { type: 'mood', logged_at: '2026-07-09T10:00:00.000Z' },
        { type: 'sleep', logged_at: '2026-07-08T10:00:00.000Z' },
      ],
      recent_finance_entries: [
        { type: 'expense', logged_at: '2026-07-09T11:00:00.000Z' },
      ],
      this_turn_entities: [{ domain: 'health', type: 'water' }],
    }, now);
    expect([...cov.health].sort()).toEqual(['mood', 'water']);
    expect([...cov.finance]).toEqual(['expense']);
    expect(cov.health.has('sleep')).toBe(false);
  });

  test('buildDataGaps: mood today ⇒ no mood dig; yesterday mood still digs', () => {
    const now = new Date('2026-07-09T12:00:00.000Z');
    const withToday = _buildDataGaps({
      recent_health_entries: [{ type: 'mood', value: 3, logged_at: '2026-07-09T08:00:00.000Z' }],
      memory: { count: 1, summary: 'x' },
      active_goals: [{ domain: 'finance', metric: 'budget' }],
    }, now);
    expect(withToday.join(' ')).not.toMatch(/mood/i);

    const withYesterday = _buildDataGaps({
      recent_health_entries: [{ type: 'mood', value: 3, logged_at: '2026-07-08T08:00:00.000Z' }],
      memory: { count: 1, summary: 'x' },
      active_goals: [{ domain: 'finance', metric: 'budget' }],
    }, now);
    expect(withYesterday.some((g) => /mood/i.test(g))).toBe(true);
  });

  test('startOfUtcDay is midnight UTC', () => {
    const d = startOfUtcDay(new Date('2026-07-09T15:30:00.000Z'));
    expect(d.toISOString()).toBe('2026-07-09T00:00:00.000Z');
  });

  test('23:59Z same day, 00:01 next UTC day is not same day', () => {
    const now = new Date('2026-07-09T12:00:00.000Z');
    expect(isSameUtcDay('2026-07-09T23:59:59.000Z', now)).toBe(true);
    expect(isSameUtcDay('2026-07-10T00:01:00.000Z', now)).toBe(false);
    expect(isSameUtcDay('2026-07-08T23:59:00.000Z', now)).toBe(false);
  });

  test('empty / invalid logged_at is not same day', () => {
    expect(isSameUtcDay(null)).toBe(false);
    expect(isSameUtcDay('not-a-date')).toBe(false);
    expect(isSameUtcDay('')).toBe(false);
  });
});
