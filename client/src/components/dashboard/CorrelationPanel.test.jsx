import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderWithSettings } from '../../test/renderWithProviders';
import CorrelationPanel from './CorrelationPanel';

describe('CorrelationPanel', () => {
  it('shows a loading skeleton', () => {
    const { container } = renderWithSettings(<CorrelationPanel patterns={[]} loading />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no patterns', () => {
    renderWithSettings(<CorrelationPanel patterns={[]} loading={false} />);
    expect(screen.getByText('Not enough data for correlations yet')).toBeInTheDocument();
  });

  it('renders one card per pattern with its observation text', () => {
    const patterns = [
      { domain: 'health', trend: 'improving', severity: 'positive', observation: 'Sleep is trending up.' },
      { domain: 'finance', trend: 'declining', severity: 'concerning', observation: 'Spending is trending up.' },
      { domain: 'both', trend: 'stable', severity: 'informative', observation: 'Sleep and spending move together.' },
    ];
    renderWithSettings(<CorrelationPanel patterns={patterns} loading={false} />);
    expect(screen.getByText('Sleep is trending up.')).toBeInTheDocument();
    expect(screen.getByText('Spending is trending up.')).toBeInTheDocument();
    expect(screen.getByText('Sleep and spending move together.')).toBeInTheDocument();
  });

  it('falls back to the "both" domain styling for an unknown domain value', () => {
    const patterns = [{ domain: 'unknown-domain', trend: 'stable', severity: 'neutral', observation: 'Fallback case.' }];
    renderWithSettings(<CorrelationPanel patterns={patterns} loading={false} />);
    expect(screen.getByText('Fallback case.')).toBeInTheDocument();
  });
});
