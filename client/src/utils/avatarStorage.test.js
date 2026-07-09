import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLocalAvatar,
  setLocalAvatar,
  clearLocalAvatar,
  resolveAvatarUrl,
  isRemoteAvatarUrl,
} from './avatarStorage';

describe('avatarStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and resolves a local avatar per user id', () => {
    expect(resolveAvatarUrl({ id: 1, avatar_url: 'https://cdn.example/a.png' }))
      .toBe('https://cdn.example/a.png');
    setLocalAvatar(1, 'data:image/jpeg;base64,abc');
    expect(getLocalAvatar(1)).toBe('data:image/jpeg;base64,abc');
    // Local wins over server URL
    expect(resolveAvatarUrl({ id: 1, avatar_url: 'https://cdn.example/a.png' }))
      .toBe('data:image/jpeg;base64,abc');
    expect(resolveAvatarUrl({ id: 2, avatar_url: 'https://cdn.example/b.png' }))
      .toBe('https://cdn.example/b.png');
  });

  it('clears local avatar', () => {
    setLocalAvatar(9, 'data:image/jpeg;base64,xyz');
    clearLocalAvatar(9);
    expect(getLocalAvatar(9)).toBeNull();
  });

  it('isRemoteAvatarUrl accepts short http(s) only', () => {
    expect(isRemoteAvatarUrl('https://example.com/a.jpg')).toBe(true);
    expect(isRemoteAvatarUrl('http://example.com/a.jpg')).toBe(true);
    expect(isRemoteAvatarUrl('data:image/jpeg;base64,xxx')).toBe(false);
    expect(isRemoteAvatarUrl('ftp://x')).toBe(false);
    expect(isRemoteAvatarUrl(`https://x.com/${'a'.repeat(500)}`)).toBe(false);
  });

  it('survives localStorage failures without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setLocalAvatar(1, 'data:image/jpeg;base64,abc')).not.toThrow();
    spy.mockRestore();
  });
});
