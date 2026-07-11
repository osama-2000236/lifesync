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

  test('falls back to first GOOGLE_AUTH_CLIENT_IDS entry', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_AUTH_CLIENT_IDS = ' web-client.apps.googleusercontent.com , other-id ';
    process.env.GOOGLE_CLIENT_SECRET = 'secret-value';
    const adapter = loadAdapter();
    expect(adapter.clientId).toBe('web-client.apps.googleusercontent.com');
    expect(adapter.isConfigured()).toBe(true);
  });

  test('prefers GOOGLE_CLIENT_ID over auth client ids', () => {
    process.env.GOOGLE_CLIENT_ID = 'fit-specific-id';
    process.env.GOOGLE_AUTH_CLIENT_IDS = 'sign-in-id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret-value';
    const adapter = loadAdapter();
    expect(adapter.clientId).toBe('fit-specific-id');
    expect(adapter.isConfigured()).toBe(true);
  });

  test('assertConfigured error is operational 503', () => {
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
    }
  });
});
