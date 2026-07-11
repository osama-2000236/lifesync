// Unit: Google Fit adapter config detection (UC-15)

describe('GoogleFitAdapter configuration', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  const loadAdapter = () => {
    jest.resetModules();
    const GoogleFitAdapter = require('../server/services/external/googleFitAdapter');
    return new GoogleFitAdapter();
  };

  test('isConfigured false without secret', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_AUTH_CLIENT_IDS;
    const adapter = loadAdapter();
    expect(adapter.isConfigured()).toBe(false);
    expect(() => adapter.assertConfigured()).toThrow(/GOOGLE_CLIENT/);
  });

  test('rejects placeholder client id / secret', () => {
    process.env.GOOGLE_CLIENT_ID = 'your_google_client_id_here';
    process.env.GOOGLE_CLIENT_SECRET = 'your_google_client_secret';
    delete process.env.GOOGLE_AUTH_CLIENT_IDS;
    const adapter = loadAdapter();
    expect(adapter.clientId).toBe('');
    expect(adapter.clientSecret).toBe('');
    expect(adapter.isConfigured()).toBe(false);
    const setup = adapter.getSetupStatus('https://api.example/callback');
    expect(setup.env_client_id_placeholder).toBe(true);
    expect(setup.env_secret_placeholder).toBe(true);
    expect(setup.configured).toBe(false);
    expect(setup.callback_uri).toContain('/callback');
  });

  test('falls back to first real GOOGLE_AUTH_CLIENT_IDS entry', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_AUTH_CLIENT_IDS = ' web-client.apps.googleusercontent.com , other.apps.googleusercontent.com ';
    process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-abcdefghijklmnopqrstuvwxyz';
    const adapter = loadAdapter();
    expect(adapter.clientId).toBe('web-client.apps.googleusercontent.com');
    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.getSetupStatus().client_id_source).toBe('GOOGLE_AUTH_CLIENT_IDS');
  });

  test('prefers real GOOGLE_CLIENT_ID over auth client ids', () => {
    process.env.GOOGLE_CLIENT_ID = 'fit-specific-id.apps.googleusercontent.com';
    process.env.GOOGLE_AUTH_CLIENT_IDS = 'sign-in-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-abcdefghijklmnopqrstuvwxyz';
    const adapter = loadAdapter();
    expect(adapter.clientId).toBe('fit-specific-id.apps.googleusercontent.com');
    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.getSetupStatus().client_id_source).toBe('GOOGLE_CLIENT_ID');
  });

  test('assertConfigured error is operational 503 with setup', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_AUTH_CLIENT_IDS;
    const adapter = loadAdapter();
    try {
      adapter.assertConfigured();
      throw new Error('expected throw');
    } catch (err) {
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('GOOGLE_FIT_NOT_CONFIGURED');
      expect(err.isOperational).toBe(true);
      expect(err.setup.missing).toEqual(expect.arrayContaining(['client_id', 'client_secret']));
    }
  });
});
