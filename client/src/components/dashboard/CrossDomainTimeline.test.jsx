import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderWithSettings } from '../../test/renderWithProviders';
import CrossDomainTimeline, { buildDailySeries } from './CrossDomainTimeline';

describe('buildDailySeries', () => {
  it('sums sleep hours and expense amounts per day, ignoring other entry types', () => {
    const healthData = [
      { type: 'sleep', value: 7, logged_at: '2026-01-01T08:00:00Z' },
      { type: 'sleep', value: 1, logged_at: '2026-01-01T20:00:00Z' },
      { type: 'steps', value: 5000, logged_at: '2026-01-01T09:00:00Z' },
      { type: 'sleep', value: 6, logged_at: '2026-01-02T08:00:00Z' },
    ];
    const financeData = [
      { type: 'expense', amount: 20, logged_at: '2026-01-01T10:00:00Z' },
      { type: 'expense', amount: 5, logged_at: '2026-01-01T11:00:00Z' },
      { type: 'income', amount: 1000, logged_at: '2026-01-01T12:00:00Z' },
    ];

    const series = buildDailySeries(healthData, financeData);

    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ sleep: 8, spend: 25 });
    expect(series[1]).toMatchObject({ sleep: 6, spend: 0 });
  });

  it('returns an empty array when given no data', () => {
    expect(buildDailySeries([], [])).toEqual([]);
  });

  it('unions days that only have health or only have finance data', () => {
    const healthData = [{ type: 'sleep', value: 7, logged_at: '2026-02-01T08:00:00Z' }];
    const financeData = [{ type: 'expense', amount: 10, logged_at: '2026-02-02T08:00:00Z' }];
    const series = buildDailySeries(healthData, financeData);
    expect(series).toHaveLength(2);
  });
});

describe('CrossDomainTimeline', () => {
  it('shows a loading skeleton', () => {
    const { container } = renderWithSettings(<CrossDomainTimeline healthData={[]} financeData={[]} loading />);
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
  });

  it('shows an empty state with fewer than 3 days of overlapping data', () => {
    const healthData = [{ type: 'sleep', value: 7, logged_at: '2026-03-01T08:00:00Z' }];
    renderWithSettings(<CrossDomainTimeline healthData={healthData} financeData={[]} loading={false} />);
    expect(screen.getByText('Not enough data for correlations yet')).toBeInTheDocument();
  });

  it('renders an svg chart with at least 3 days of data', () => {
    const healthData = [
      { type: 'sleep', value: 7, logged_at: '2026-03-01T08:00:00Z' },
      { type: 'sleep', value: 6, logged_at: '2026-03-02T08:00:00Z' },
      { type: 'sleep', value: 8, logged_at: '2026-03-03T08:00:00Z' },
    ];
    const financeData = [
      { type: 'expense', amount: 20, logged_at: '2026-03-01T08:00:00Z' },
      { type: 'expense', amount: 15, logged_at: '2026-03-02T08:00:00Z' },
      { type: 'expense', amount: 30, logged_at: '2026-03-03T08:00:00Z' },
    ];
    const { container } = renderWithSettings(<CrossDomainTimeline healthData={healthData} financeData={financeData} loading={false} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('circle').length).toBe(6);
  });
});
