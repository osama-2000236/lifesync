import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EntityReceipts from './EntityReceipts';

const t = (k) => k;

describe('EntityReceipts', () => {
  it('renders nothing when no entities were logged', () => {
    const { container } = render(<EntityReceipts entities={{ health: [], finance: [], linked: [] }} t={t} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for undefined entities', () => {
    const { container } = render(<EntityReceipts entities={undefined} t={t} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders health and finance chips with values', () => {
    render(<EntityReceipts entities={{
      health: [{ type: 'sleep', value: 7 }, { type: 'mood' }],
      finance: [{ type: 'expense', amount: 15 }, { type: 'income' }],
      linked: [],
    }} t={t} />);
    expect(screen.getAllByTestId('health-chip')).toHaveLength(2);
    expect(screen.getAllByTestId('finance-chip')).toHaveLength(2);
    expect(screen.getByText('sleep · 7')).toBeInTheDocument();
    expect(screen.getByText('mood')).toBeInTheDocument();
    expect(screen.getByText('expense · $15')).toBeInTheDocument();
    expect(screen.getByText('income')).toBeInTheDocument();
    expect(screen.queryByTestId('cross-domain-badge')).not.toBeInTheDocument();
  });

  it('shows the cross-domain badge when domains were linked', () => {
    render(<EntityReceipts entities={{
      health: [{ type: 'sleep', value: 6 }],
      finance: [{ type: 'expense', amount: 50 }],
      linked: [{ id: 1 }],
    }} t={t} />);
    expect(screen.getByTestId('cross-domain-badge')).toBeInTheDocument();
  });
});
