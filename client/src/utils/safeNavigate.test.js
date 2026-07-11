import { describe, expect, it, vi } from 'vitest';
import {
  isAllowedOAuthAuthorizeUrl,
  isSafeHttpUrl,
  navigateToOAuthAuthorizeUrl,
} from './safeNavigate';

describe('safeNavigate', () => {
  it('accepts relative /api and https URLs only for isSafeHttpUrl', () => {
    expect(isSafeHttpUrl('/api')).toBe(true);
    expect(isSafeHttpUrl('https://example.com/api')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:5000/api')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('//evil.com')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });

  it('only allows Google OAuth hosts over https', () => {
    expect(isAllowedOAuthAuthorizeUrl(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
    )).toBe(true);
    expect(isAllowedOAuthAuthorizeUrl(
      'https://oauth2.googleapis.com/token',
    )).toBe(true);
    expect(isAllowedOAuthAuthorizeUrl('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isAllowedOAuthAuthorizeUrl('https://evil.com/oauth')).toBe(false);
    expect(isAllowedOAuthAuthorizeUrl('javascript:alert(1)')).toBe(false);
  });

  it('navigateToOAuthAuthorizeUrl assigns only when allowlisted', () => {
    const assign = vi.fn();
    expect(navigateToOAuthAuthorizeUrl('https://evil.example/phish', assign)).toBe(false);
    expect(assign).not.toHaveBeenCalled();

    const good = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc';
    expect(navigateToOAuthAuthorizeUrl(good, assign)).toBe(true);
    expect(assign).toHaveBeenCalledWith(good);
  });
});
