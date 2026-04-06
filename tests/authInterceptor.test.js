import { shouldAttemptTokenRefresh } from '../client/src/services/authInterceptor';

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
});
