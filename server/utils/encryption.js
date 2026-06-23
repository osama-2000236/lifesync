// server/utils/encryption.js
// ============================================
// Field-Level Encryption Utility
// Encrypts sensitive health metrics and financial amounts at rest
// Uses AES-256 encryption via crypto-js
// ============================================

const CryptoJS = require('crypto-js');
require('dotenv').config();

// Resolve the field-encryption key.
// Prefer the dedicated ENCRYPTION_KEY. Falling back to JWT_SECRET couples two
// unrelated secrets and blocks key rotation, so it is only tolerated outside
// production — and even then it warns. In production a missing ENCRYPTION_KEY
// is a hard failure: better to crash on boot than to encrypt data at rest with
// the JWT signing secret.
const resolveEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) return process.env.ENCRYPTION_KEY;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY is not set. Refusing to fall back to JWT_SECRET for ' +
      'field-level encryption in production. Set a dedicated ENCRYPTION_KEY ' +
      '(min 32 chars).'
    );
  }

  if (process.env.JWT_SECRET) {
    console.warn(
      '⚠️  ENCRYPTION_KEY is not set; falling back to JWT_SECRET for field ' +
      'encryption. This is for local/dev only — set a dedicated ENCRYPTION_KEY.'
    );
    return process.env.JWT_SECRET;
  }

  throw new Error('Neither ENCRYPTION_KEY nor JWT_SECRET is set; cannot encrypt fields.');
};

const ENCRYPTION_KEY = resolveEncryptionKey();

/**
 * Encrypt a value for storage
 * @param {string|number} value - The plaintext value to encrypt
 * @returns {string} Encrypted ciphertext
 */
const encrypt = (value) => {
  if (value === null || value === undefined) return null;
  const plaintext = String(value);
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString();
};

/**
 * Decrypt a stored value
 * @param {string} ciphertext - The encrypted value
 * @returns {string} Decrypted plaintext
 */
const decrypt = (ciphertext) => {
  if (!ciphertext) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) return null;
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
};

/**
 * Decrypt and parse as number (for numeric fields like amounts, values)
 * @param {string} ciphertext
 * @returns {number|null}
 */
const decryptNumber = (ciphertext) => {
  const decrypted = decrypt(ciphertext);
  if (decrypted === null) return null;
  const num = parseFloat(decrypted);
  return isNaN(num) ? null : num;
};

/**
 * Sequelize hook helper: Encrypt specified fields before save
 * @param {Object} instance - Sequelize model instance
 * @param {string[]} fields - Array of field names to encrypt
 */
const encryptFields = (instance, fields) => {
  fields.forEach((field) => {
    const value = instance.getDataValue(field);
    if (value !== null && value !== undefined && !isEncrypted(value)) {
      instance.setDataValue(field, encrypt(value));
    }
  });
};

/**
 * Decrypt specified fields on a model instance (for reading)
 * @param {Object} instance - Sequelize model instance
 * @param {string[]} fields - Array of field names to decrypt
 */
const decryptFields = (instance, fields) => {
  fields.forEach((field) => {
    const value = instance.getDataValue(field);
    if (value && isEncrypted(value)) {
      instance.setDataValue(field, decrypt(value));
    }
  });
};

/**
 * Check if a value appears to be AES-encrypted (Base64 ciphertext)
 * @param {string} value
 * @returns {boolean}
 */
const isEncrypted = (value) => {
  if (typeof value !== 'string') return false;
  // AES encrypted strings from CryptoJS are Base64 with specific pattern
  return value.length > 20 && /^U2Fsd/.test(value);
};

module.exports = {
  encrypt,
  decrypt,
  decryptNumber,
  encryptFields,
  decryptFields,
  isEncrypted,
};
