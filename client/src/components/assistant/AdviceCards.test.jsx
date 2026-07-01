import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AdviceCards from './AdviceCards';

const t = (k) => k;

describe('AdviceCards', () => {
  it('renders nothing without advice', () => {
    const { container } = render(<AdviceCards advice={null} t={t} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders scores + items across domains and priorities', () => {
    const advice = {
      scores: { health: 72, financial: 60 },
      advice: [
        { text: 'Sleep more', priority: 'high', domain: 'both', reason: 'because' },
        { text: 'Move', priority: 'medium', domain: 'health' },
        { text: 'Save', priority: 'low', domain: 'finance' },
        { text: 'Fallback', priority: 'weird', domain: 'mystery' },
      ],
    };
    render(<AdviceCards advice={advice} t={t} />);
    expect(screen.getAllByTestId('advice-item')).toHaveLength(4);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('because')).toBeInTheDocument();
  });

  it('handles missing scores + empty advice list', () => {
    render(<AdviceCards advice={{ advice: null }} t={t} />);
    expect(screen.queryByTestId('advice-item')).not.toBeInTheDocument();
    expect(screen.queryByText('assistant.healthScore')).not.toBeInTheDocument();
  });

  it('renders em dash for null score values', () => {
    render(<AdviceCards advice={{ scores: { health: null, financial: null }, advice: [] }} t={t} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
