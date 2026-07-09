import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/api', () => ({
  voiceAPI: {
    speak: vi.fn(() => Promise.resolve({ data: new Blob(['x'], { type: 'audio/mpeg' }) })),
  },
}));

import { speakReply, _resetCloudTtsKnown } from './speakReply';
import { voiceAPI } from '../services/api';

describe('speakReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCloudTtsKnown();
    window.speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'en-US', name: 'Sam' }],
    };
    window.SpeechSynthesisUtterance = function U(t) { this.text = t; };
  });

  it('uses browser when a local voice exists for the language', async () => {
    const r = await speakReply('Hello there', { locale: 'en' });
    expect(r.via).toBe('browser');
    expect(voiceAPI.speak).not.toHaveBeenCalled();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('uses cloud when no local Arabic voice', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
    window.Audio = function Audio() {
      this.play = () => Promise.resolve();
      this.pause = () => {};
      queueMicrotask(() => this.onended?.());
    };
    const r = await speakReply('مرحبا بك', { locale: 'en' });
    expect(r.via).toBe('cloud');
    expect(voiceAPI.speak).toHaveBeenCalled();
    expect(voiceAPI.speak.mock.calls[0][1]).toMatch(/^ar/);
  });
});
