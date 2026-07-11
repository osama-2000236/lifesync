// tests/userIntegrationModel.test.js
// OAuth tokens are credentials — they must be AES-encrypted at rest like log
// text, and come back plaintext through the model hooks (no DB needed).

const UserIntegration = require('../server/models/UserIntegration');
const { encrypt, isEncrypted } = require('../server/utils/encryption');

const fakeInstance = (data) => {
  const store = { ...data };
  return {
    getDataValue: (f) => store[f],
    setDataValue: (f, v) => { store[f] = v; },
    changed: (f) => f in store,
    _store: store,
  };
};

describe('UserIntegration token encryption hooks', () => {
  test('beforeCreate encrypts both tokens at rest', async () => {
    const inst = fakeInstance({ access_token: 'plain-access', refresh_token: 'plain-refresh' });
    await UserIntegration.runHooks('beforeCreate', inst, {});
    expect(inst._store.access_token).not.toBe('plain-access');
    expect(isEncrypted(inst._store.access_token)).toBe(true);
    expect(inst._store.refresh_token).not.toBe('plain-refresh');
    expect(isEncrypted(inst._store.refresh_token)).toBe(true);
  });

  test('afterFind decrypts tokens for use', async () => {
    const inst = fakeInstance({
      access_token: encrypt('plain-access'),
      refresh_token: encrypt('plain-refresh'),
    });
    await UserIntegration.runHooks('afterFind', inst, {});
    expect(inst._store.access_token).toBe('plain-access');
    expect(inst._store.refresh_token).toBe('plain-refresh');
  });
});
