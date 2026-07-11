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

  test('beforeUpdate does not double-encrypt already-ciphertext tokens', async () => {
    const cipher = encrypt('plain-access');
    const inst = fakeInstance({ access_token: cipher, refresh_token: encrypt('plain-refresh') });
    await UserIntegration.runHooks('beforeUpdate', inst, {});
    // Still the same ciphertext envelope (U2FsdGVk…), not nested encryption.
    expect(inst._store.access_token).toBe(cipher);
    expect(isEncrypted(inst._store.access_token)).toBe(true);
  });

  test('beforeUpdate encrypts plaintext Google-style tokens (ya29…)', async () => {
    const inst = fakeInstance({
      access_token: 'ya29.a0AfH6SMB-example-oauth-access',
      refresh_token: '1//0example-refresh-token-value',
    });
    await UserIntegration.runHooks('beforeUpdate', inst, {});
    expect(isEncrypted(inst._store.access_token)).toBe(true);
    expect(isEncrypted(inst._store.refresh_token)).toBe(true);
    expect(inst._store.access_token).not.toMatch(/^ya29\./);
  });
});
