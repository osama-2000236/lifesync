import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachBlobUrl, revokeAudioBlob, stopAndRevokeAudio } from './cloudAudio';

describe('cloudAudio', () => {
  beforeEach(() => {
    global.URL.revokeObjectURL = vi.fn();
  });

  it('attachBlobUrl stores url for later revoke', () => {
    const audio = {};
    attachBlobUrl(audio, 'blob:http://local/x');
    expect(audio.__lifesyncBlobUrl).toBe('blob:http://local/x');
  });

  it('revokeAudioBlob revokes and clears', () => {
    const audio = { __lifesyncBlobUrl: 'blob:http://local/y' };
    revokeAudioBlob(audio);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://local/y');
    expect(audio.__lifesyncBlobUrl).toBeNull();
  });

  it('stopAndRevokeAudio pauses, clears src, and revokes', () => {
    const audio = {
      __lifesyncBlobUrl: 'blob:http://local/z',
      pause: vi.fn(),
      src: 'blob:http://local/z',
    };
    stopAndRevokeAudio(audio);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://local/z');
  });

  it('stopAndRevokeAudio is a no-op for null', () => {
    expect(() => stopAndRevokeAudio(null)).not.toThrow();
  });
});
