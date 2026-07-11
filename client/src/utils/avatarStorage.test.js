import { describe, it, expect } from 'vitest';
import { isRemoteAvatarUrl } from './avatarStorage';

describe('avatarStorage', () => {
  it('isRemoteAvatarUrl accepts short http(s) only', () => {
    expect(isRemoteAvatarUrl('https://example.com/a.jpg')).toBe(true);
    expect(isRemoteAvatarUrl('http://example.com/a.jpg')).toBe(true);
    expect(isRemoteAvatarUrl('data:image/jpeg;base64,xxx')).toBe(false);
    expect(isRemoteAvatarUrl('ftp://x')).toBe(false);
    expect(isRemoteAvatarUrl(`https://x.com/${'a'.repeat(500)}`)).toBe(false);
    expect(isRemoteAvatarUrl(null)).toBe(false);
    expect(isRemoteAvatarUrl(undefined)).toBe(false);
  });
});
