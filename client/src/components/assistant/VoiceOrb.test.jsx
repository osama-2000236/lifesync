import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VoiceOrb from './VoiceOrb';

describe('VoiceOrb', () => {
  it('renders each phase with the right data-phase', () => {
    ['idle', 'listening', 'thinking', 'speaking', 'unknown'].forEach((phase) => {
      const { getByTestId, unmount } = render(<VoiceOrb phase={phase} level={0.5} />);
      expect(getByTestId('voice-orb')).toHaveAttribute('data-phase', phase);
      unmount();
    });
  });

  it('scales while listening (level applied)', () => {
    const { getByTestId } = render(<VoiceOrb phase="listening" level={1} size={200} />);
    expect(getByTestId('voice-orb')).toBeInTheDocument();
  });

  it('defaults size + level', () => {
    const { getByTestId } = render(<VoiceOrb />);
    expect(getByTestId('voice-orb')).toHaveAttribute('data-phase', 'idle');
  });
});
