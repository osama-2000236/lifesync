import { resolveRuntimeConfig } from '../client/src/config/runtimeConfig';

describe('runtime config', () => {
  it('does not silently bake hidden production API or Google defaults when env is missing', () => {
    expect(resolveRuntimeConfig({ DEV: false, PROD: true })).toEqual({
      apiBaseUrl: '/api',
      googleClientId: '',
      warnings: [
        'VITE_API_URL is not set for this production build. Falling back to same-origin /api.',
        'VITE_GOOGLE_CLIENT_ID is not set for this production build. Google sign-in is disabled.',
      ],
    });
  });

  it('keeps the dev proxy default when no explicit API URL is provided locally', () => {
    expect(resolveRuntimeConfig({ DEV: true, PROD: false })).toEqual({
      apiBaseUrl: '/api',
      googleClientId: '',
      warnings: [],
    });
  });
});
