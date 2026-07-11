const { frontendUrl, apiPublicUrl } = require('../server/utils/frontendUrl');

describe('frontendUrl / apiPublicUrl', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  test('picks first absolute origin from CORS_ORIGIN list', () => {
    process.env.FRONTEND_URL = '';
    process.env.APP_PUBLIC_URL = '';
    process.env.CORS_ORIGIN = 'https://lifesync.1202883.workers.dev,http://localhost:5173';
    expect(frontendUrl()).toBe('https://lifesync.1202883.workers.dev');
  });

  test('apiPublicUrl uses APP_URL when set', () => {
    process.env.API_PUBLIC_URL = '';
    process.env.APP_URL = 'https://lifesync-production-fdf9.up.railway.app';
    expect(apiPublicUrl()).toBe('https://lifesync-production-fdf9.up.railway.app');
  });
});
