import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StreakCard from './StreakCard';

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ t: (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k), locale: 'en' }),
}));

describe('StreakCard', () => {
  it('keeps the streak tile tint dark-mode safe (no hard light gradient)', () => {
    const { container } = render(
      <StreakCard
        data={{
          streak: { current: 3, longest: 5, active_days: 10 },
          achievements: [],
          unlocked_count: 0,
        }}
      />,
    );
    const tile = container.querySelector('.from-coral-50');
    expect(tile).toBeTruthy();
    expect(tile.className).toMatch(/dark:from-coral-500\/15/);
    expect(tile.className).toMatch(/dark:to-amber-500\/15/);
    expect(screen.getByText('streak.title')).toBeInTheDocument();
  });
});
