import { resolveRuntimeConfig } from '../client/src/config/runtimeConfig';

describe('resolveRuntimeConfig', () => {
  test('production without VITE_API_URL falls back to /api with warning', () => {
    expect(resolveRuntimeConfig({ DEV: false, PROD: true })).toEqual({
      apiBaseUrl: '/api',
      googleClientId: '',
      warnings: [
        'VITE_API_URL is not set for this production build. Falling back to same-origin /api.',
        'VITE_GOOGLE_CLIENT_ID is not set for this production build. Google sign-in is disabled.',
      ],
    });
  });

  test('dev without VITE_API_URL still uses /api without production warnings', () => {
    expect(resolveRuntimeConfig({ DEV: true, PROD: false })).toEqual({
      apiBaseUrl: '/api',
      googleClientId: '',
      warnings: [],
    });
  });

  test('rejects javascript: and protocol-relative API bases', () => {
    const bad = resolveRuntimeConfig({
      DEV: false,
      VITE_API_URL: 'javascript:alert(1)',
      VITE_GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com',
    });
    expect(bad.apiBaseUrl).toBe('/api');
    expect(bad.warnings.some((w) => /not a valid/i.test(w))).toBe(true);

    const protoRel = resolveRuntimeConfig({
      DEV: true,
      VITE_API_URL: '//evil.example/api',
    });
    expect(protoRel.apiBaseUrl).toBe('/api');
  });

  test('accepts absolute https and relative /api paths', () => {
    expect(resolveRuntimeConfig({
      DEV: true,
      VITE_API_URL: 'https://lifesync-production-fdf9.up.railway.app/api',
    }).apiBaseUrl).toBe('https://lifesync-production-fdf9.up.railway.app/api');

    expect(resolveRuntimeConfig({
      DEV: true,
      VITE_API_URL: '/api/v2/',
    }).apiBaseUrl).toBe('/api/v2');
  });
});
