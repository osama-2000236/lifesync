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

  it('renders the audio-reactive WaveRing only when a bandsRef is provided', () => {
    const { queryByTestId, unmount } = render(<VoiceOrb phase="listening" />);
    expect(queryByTestId('wave-ring')).toBeNull();
    unmount();

    const bandsRef = { current: new Float32Array(24) };
    const { getByTestId } = render(<VoiceOrb phase="listening" bandsRef={bandsRef} />);
    expect(getByTestId('wave-ring')).toBeInTheDocument();
  });
});
