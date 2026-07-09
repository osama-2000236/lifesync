import { shouldAttemptTokenRefresh, isAuthEntryEndpoint } from '../client/src/services/authInterceptor';

describe('auth interceptor 401 handling', () => {
  it('does not attempt token refresh for invalid login responses', () => {
    const error = {
      response: { status: 401, data: { error: 'Invalid email or password' } },
      config: {
        url: '/auth/login',
        _retry: false,
      },
    };

    expect(shouldAttemptTokenRefresh(error)).toBe(false);
  });

  it('still attempts token refresh for protected API requests', () => {
    const error = {
      response: { status: 401, data: { error: 'Access denied' } },
      config: {
        url: '/health-logs?page=1',
        _retry: false,
      },
    };

    expect(shouldAttemptTokenRefresh(error)).toBe(true);
  });

  it('does not retry-loop: second 401 after _retry is set skips refresh', () => {
    const error = {
      response: { status: 401 },
      config: { url: '/health-logs', _retry: true },
    };
    expect(shouldAttemptTokenRefresh(error)).toBe(false);
  });

  it('does not refresh on non-401', () => {
    expect(shouldAttemptTokenRefresh({
      response: { status: 403 },
      config: { url: '/health-logs', _retry: false },
    })).toBe(false);
  });

  it('classifies auth entry endpoints (no refresh storm on bad credentials)', () => {
    expect(isAuthEntryEndpoint('/auth/login')).toBe(true);
    expect(isAuthEntryEndpoint('/auth/register/send-otp')).toBe(true);
    expect(isAuthEntryEndpoint('/auth/google')).toBe(true);
    expect(isAuthEntryEndpoint('/health-logs')).toBe(false);
    expect(isAuthEntryEndpoint('/auth/me')).toBe(false);
  });
});
