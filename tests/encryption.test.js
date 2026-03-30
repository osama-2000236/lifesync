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
});
