// server/utils/encryption.js
// ============================================
// Field-Level Encryption Utility
// Encrypts sensitive health metrics and financial amounts at rest
// Uses AES-256 encryption via crypto-js
// ============================================

const CryptoJS = require('crypto-js');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.JWT_SECRET; // Reuse a strong secret; in production, use a dedicated key

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
