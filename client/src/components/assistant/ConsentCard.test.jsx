import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConsentCard from './ConsentCard';

const t = (k) => k;

describe('ConsentCard', () => {
  it('shows the cross-domain badge only when crossDomain', () => {
    const { rerender } = render(<ConsentCard prompt="P" crossDomain onAccept={() => {}} onDecline={() => {}} t={t} />);
    expect(screen.getByText('assistant.crossDomain')).toBeInTheDocument();
    rerender(<ConsentCard prompt="P" crossDomain={false} onAccept={() => {}} onDecline={() => {}} t={t} />);
    expect(screen.queryByText('assistant.crossDomain')).not.toBeInTheDocument();
  });

  it('fires accept / decline', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(<ConsentCard prompt="Ask me?" onAccept={onAccept} onDecline={onDecline} t={t} />);
    expect(screen.getByText('Ask me?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('consent-accept'));
    fireEvent.click(screen.getByTestId('consent-decline'));
    expect(onAccept).toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
  });

  it('disables buttons when busy', () => {
    render(<ConsentCard prompt="P" busy onAccept={() => {}} onDecline={() => {}} t={t} />);
    expect(screen.getByTestId('consent-accept')).toBeDisabled();
  });

  // Light emerald/white gradient must not stay in dark mode (glare + false light card).
  it('uses a dark-mode surface on the card gradient', () => {
    render(<ConsentCard prompt="P" onAccept={() => {}} onDecline={() => {}} t={t} />);
    const card = screen.getByTestId('consent-card');
    expect(card.className).toMatch(/dark:from-emerald-500\/10/);
    expect(card.className).toMatch(/dark:to-surface-raised/);
  });
});
