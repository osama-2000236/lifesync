// tests/linkedDomainDecrypt.test.js
// ============================================
// Live-prod bug: the prompt's LINKED line showed "USD 80 U2FsdGVkX1…" —
// Sequelize fires afterFind only on the queried model, so eager-loaded
// healthLog/financialLog instances skipped their own decrypt hooks and
// LinkedDomain includes leaked raw AES ciphertext into model context.
// The LinkedDomain afterFind hook now decrypts nested instances itself.
// ============================================

const LinkedDomain = require('../server/models/LinkedDomain');
const { encrypt } = require('../server/utils/encryption');

// Minimal stand-in for an eager-loaded Sequelize instance.
const fakeInstance = (data) => ({
  ...data,
  getDataValue(field) { return this[field]; },
  setDataValue(field, value) { this[field] = value; },
});

const runAfterFind = (rows) => LinkedDomain.runHooks('afterFind', rows);

describe('LinkedDomain afterFind decrypts eager-loaded log fields', () => {
  test('financial description and health value_text/notes come out plaintext', async () => {
    const row = {
      id: 1,
      healthLog: fakeInstance({ type: 'sleep', value: 4, value_text: encrypt('poor sleep'), notes: encrypt('late night') }),
      financialLog: fakeInstance({ type: 'expense', amount: 80, description: encrypt('coffee and takeout') }),
    };
    await runAfterFind([row]);
    expect(row.financialLog.description).toBe('coffee and takeout');
    expect(row.healthLog.value_text).toBe('poor sleep');
    expect(row.healthLog.notes).toBe('late night');
    expect(row.financialLog.description).not.toMatch(/^U2FsdGVkX1/);
  });

  test('plaintext values and half-empty links pass through untouched', async () => {
    const row = {
      id: 2,
      healthLog: null, // finance-only link
      financialLog: fakeInstance({ description: 'already plain' }),
    };
    await runAfterFind([row]);
    expect(row.financialLog.description).toBe('already plain');
    await expect(runAfterFind(null)).resolves.not.toThrow();
    await expect(runAfterFind({ id: 3 })).resolves.not.toThrow(); // single non-array result
  });
});
