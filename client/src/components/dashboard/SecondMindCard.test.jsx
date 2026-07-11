import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import SecondMindCard from './SecondMindCard';

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ t: (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k), locale: 'en' }),
}));

const renderCard = (props) => render(
  <MemoryRouter>
    <SecondMindCard {...props} />
  </MemoryRouter>,
);

describe('SecondMindCard', () => {
  it('shows a skeleton while loading', () => {
    renderCard({ loading: true });
    expect(screen.queryByTestId('second-mind-card')).not.toBeInTheDocument();
  });

  it('honest empty state + chat CTA when no horizon data', () => {
    renderCard({ horizon: null });
    expect(screen.getByTestId('second-mind-empty')).toBeInTheDocument();
    expect(screen.getByTestId('second-mind-cta')).toHaveAttribute('href', '/chat');
    expect(screen.queryByTestId('second-mind-xd')).not.toBeInTheDocument();
  });

  it('health-only week: sleep tile, no spend tile, no invented XD line', () => {
    renderCard({
      horizon: { week: { sleep_avg: 7.2, sleep_trend: 'flat', sleep_delta_pct: 0, expense_total: 0 } },
    });
    expect(screen.getByTestId('mind-tile-sleep')).toHaveTextContent('7.2h');
    expect(screen.queryByTestId('mind-tile-spend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('second-mind-xd')).not.toBeInTheDocument();
  });

  it('full week: three tiles with WoW deltas + real-numbers XD line', () => {
    renderCard({
      horizon: {
        week: {
          sleep_avg: 5.8, sleep_trend: 'down', sleep_delta_pct: -22.8,
          mood_avg: 6, mood_trend: 'flat', mood_delta_pct: 0,
          expense_total: 200, expense_prev: 120, expense_trend: 'up', expense_delta_pct: 66.7,
        },
      },
    });
    expect(screen.getByTestId('mind-tile-sleep')).toHaveTextContent('5.8h');
    expect(screen.getByTestId('mind-tile-sleep')).toHaveTextContent('22.8%');
    expect(screen.getByTestId('mind-tile-mood')).toHaveTextContent('6/10');
    expect(screen.getByTestId('mind-tile-spend')).toHaveTextContent('200');
    expect(screen.getByTestId('mind-tile-spend')).toHaveTextContent('66.7%');
    // XD line carries the real numbers, never invented.
    expect(screen.getByTestId('second-mind-xd')).toHaveTextContent('dash.mind.xdSleepSpend:{"sleep":5.8,"pct":66.7}');
  });

  it('mood↓ + spend↑ week: mood-spend XD line (sleep pattern not matched)', () => {
    renderCard({
      horizon: {
        week: {
          sleep_avg: 7.5, sleep_trend: 'flat', sleep_delta_pct: 0,
          mood_avg: 3, mood_trend: 'down', mood_delta_pct: -40,
          expense_total: 300, expense_prev: 200, expense_trend: 'up', expense_delta_pct: 10,
        },
      },
    });
    expect(screen.getByTestId('second-mind-xd')).toHaveTextContent('dash.mind.xdMoodSpend:{"mood":3}');
  });

  it('mood↑ + exercise week: mood-exercise XD line from coverage', () => {
    renderCard({
      horizon: {
        week: { mood_avg: 8, mood_trend: 'up', mood_delta_pct: 14 },
        coverage_week: { health: ['mood', 'exercise'] },
      },
    });
    expect(screen.getByTestId('second-mind-xd')).toHaveTextContent('dash.mind.xdMoodExercise:{"mood":8}');
  });

  it('renders live goal progress with server-computed current/target', () => {
    renderCard({
      horizon: null,
      goals: [
        { domain: 'health', metric: 'steps', target: 10000, current: 6800, unit: 'steps', period: 'daily' },
        { domain: 'finance', metric: 'budget', target: 1200, current: 350, unit: 'ILS', period: 'monthly' },
        { domain: 'health', metric: 'water', target: 0, current: 0, unit: 'liters', period: 'daily' }, // target 0 → hidden
      ],
    });
    expect(screen.getByTestId('mind-goals')).toBeInTheDocument();
    expect(screen.getByTestId('mind-goal-steps')).toHaveTextContent('6,800/10,000 steps');
    expect(screen.getByTestId('mind-goal-budget')).toHaveTextContent('350/1,200 ILS');
    expect(screen.queryByTestId('mind-goal-water')).not.toBeInTheDocument();
  });

  it('no goals → no goals strip', () => {
    renderCard({ horizon: null, goals: [] });
    expect(screen.queryByTestId('mind-goals')).not.toBeInTheDocument();
  });
});
