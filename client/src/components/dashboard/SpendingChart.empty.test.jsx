import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SpendingChart from './SpendingChart';

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    t: (k) => k,
    theme: 'light',
    locale: 'en',
  }),
}));

describe('SpendingChart empty / loading', () => {
  it('shows empty state when no expense data (no chart crash)', () => {
    render(
      <MemoryRouter>
        <SpendingChart financeData={[]} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('chart.noSpending')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    const { container } = render(
      <MemoryRouter>
        <SpendingChart financeData={[]} loading />
      </MemoryRouter>,
    );
    expect(container.querySelector('.skeleton')).not.toBeNull();
  });
});
