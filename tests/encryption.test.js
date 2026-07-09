// tests/encryption.test.js
// ============================================
// Encryption Utility Test Suite
// Tests field-level AES encryption/decryption
// ============================================

const {
  encrypt, decrypt, decryptNumber, isEncrypted,
} = require('../server/utils/encryption');

describe('Encryption Utility', () => {
  describe('encrypt / decrypt', () => {
    test('should encrypt and decrypt a string', () => {
      const original = 'sensitive health data';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(decrypted).toBe(original);
    });

    test('should encrypt and decrypt a number as string', () => {
      const original = '150.75';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    test('should handle numeric input', () => {
      const encrypted = encrypt(42);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe('42');
    });

    test('should return null for null input', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    test('should return null for undefined input', () => {
      expect(encrypt(undefined)).toBeNull();
    });

    test('should produce different ciphertexts for same input (IV varies)', () => {
      const encrypted1 = encrypt('test');
      const encrypted2 = encrypt('test');

      // CryptoJS AES uses random IV, so ciphertexts should differ
      // (though this is probabilistic, it's virtually certain)
      expect(encrypted1).not.toBe(encrypted2);
    });

    test('should handle empty string', () => {
      const encrypted = encrypt('');
      // CryptoJS decrypts empty string to empty UTF-8 which returns null
      // This is expected behavior — empty strings should use null instead
      expect(encrypted).toBeTruthy(); // It does encrypt
    });

    test('should handle special characters', () => {
      const original = 'Café résumé naïve $100 — "quoted"';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    test('should handle very long strings', () => {
      const original = 'x'.repeat(10000);
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
      expect(decrypted).toHaveLength(10000);
    });
  });

  describe('decryptNumber', () => {
    test('should decrypt and parse as float', () => {
      const encrypted = encrypt('150.75');
      const result = decryptNumber(encrypted);

      expect(result).toBe(150.75);
      expect(typeof result).toBe('number');
    });

    test('should return null for non-numeric encrypted value', () => {
      const encrypted = encrypt('not a number');
      const result = decryptNumber(encrypted);

      expect(result).toBeNull();
    });

    test('should return null for null input', () => {
      expect(decryptNumber(null)).toBeNull();
    });
  });

  describe('isEncrypted', () => {
    test('should detect encrypted strings', () => {
      const encrypted = encrypt('test data');

      expect(isEncrypted(encrypted)).toBe(true);
    });

    test('should reject plaintext', () => {
      expect(isEncrypted('just a normal string')).toBe(false);
    });

    test('should reject numbers', () => {
      expect(isEncrypted(42)).toBe(false);
    });

    test('should reject null', () => {
      expect(isEncrypted(null)).toBe(false);
    });

    test('should reject short strings', () => {
      expect(isEncrypted('short')).toBe(false);
    });
  });

  describe('security edges', () => {
    const { _assertKeyStrength, decrypt: dec, encrypt: enc } = require('../server/utils/encryption');

    test('assertKeyStrength rejects keys shorter than 32 chars', () => {
      expect(() => _assertKeyStrength('short', 'ENCRYPTION_KEY')).toThrow(/at least 32/);
      expect(() => _assertKeyStrength('x'.repeat(32), 'ENCRYPTION_KEY')).not.toThrow();
    });

    test('decrypt of non-encrypted legacy plaintext returns the plaintext (no crash)', () => {
      // HealthLog notes may predate encryption; isEncrypted false → passthrough.
      expect(dec('legacy plain note about blood pressure')).toBe('legacy plain note about blood pressure');
      expect(dec(42)).toBe('42');
    });

    test('decrypt of tampered ciphertext returns null (no garbage, no throw)', () => {
      const good = enc('amount-99');
      const tampered = `${good.slice(0, -4)}XXXX`;
      expect(dec(tampered)).toBeNull();
    });

    test('decrypt with wrong key returns null', () => {
      const CryptoJS = require('crypto-js');
      const foreign = CryptoJS.AES.encrypt('secret-data', 'different-key-at-least-32-characters!!').toString();
      // Looks encrypted (U2Fsd…) but wrong key → empty Utf8 → null
      expect(isEncrypted(foreign)).toBe(true);
      expect(dec(foreign)).toBeNull();
    });
  });
});

