// server/utils/encryption.js
// ============================================
// Field-Level Encryption Utility
// Encrypts sensitive health metrics and financial amounts at rest.
//
// Formats:
//   • v2 (current)  — node:crypto AES-256-GCM, scrypt-derived key, random IV,
//                     serialized as `v2:` + base64(iv | authTag | ciphertext).
//   • legacy        — CryptoJS `AES.encrypt(plaintext, passphrase)` output
//                     (base64 starting "U2Fsd" = "Salted__"): OpenSSL EVP
//                     key derivation (MD5) + AES-256-CBC. Decrypt-only, kept
//                     so rows written before the v2 migration keep reading.
//                     New writes always use v2.
// ============================================

const crypto = require('crypto');
require('dotenv').config();

// Resolve the field-encryption key.
// Prefer the dedicated ENCRYPTION_KEY. Falling back to JWT_SECRET couples two
// unrelated secrets and blocks key rotation, so it is only tolerated outside
// production — and even then it warns. In production a missing ENCRYPTION_KEY
// is a hard failure: better to crash on boot than to encrypt data at rest with
// the JWT signing secret.
const assertKeyStrength = (key, label) => {
  if (!key || typeof key !== 'string' || key.length < 32) {
    throw new Error(
      `${label} must be at least 32 characters. Refusing weak field-encryption key.`,
    );
  }
  return key;
};

const resolveEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    return assertKeyStrength(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
  }

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
    return assertKeyStrength(process.env.JWT_SECRET, 'JWT_SECRET (encryption fallback)');
  }

  throw new Error('Neither ENCRYPTION_KEY nor JWT_SECRET is set; cannot encrypt fields.');
};

const ENCRYPTION_KEY = resolveEncryptionKey();

// ── v2: AES-256-GCM ───────────────────────────────────────────────────────────
// Static scrypt salt is fine here: the input is an app-level ≥32-char secret,
// not a user password, and the salt only needs to domain-separate this key.
const V2_PREFIX = 'v2:';
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;
const v2Key = crypto.scryptSync(ENCRYPTION_KEY, 'lifesync-field-encryption-v2', 32);

const encryptV2 = (plaintext) => {
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', v2Key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return V2_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
};

const decryptV2 = (value) => {
  const data = Buffer.from(value.slice(V2_PREFIX.length), 'base64');
  const iv = data.subarray(0, GCM_IV_LEN);
  const tag = data.subarray(GCM_IV_LEN, GCM_IV_LEN + GCM_TAG_LEN);
  const ciphertext = data.subarray(GCM_IV_LEN + GCM_TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', v2Key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

// ── legacy: CryptoJS/OpenSSL-EVP AES-256-CBC (decrypt-only) ──────────────────
// EVP_BytesToKey with MD5 — weak by modern standards, which is exactly why new
// writes use v2; this exists only to read pre-migration rows.
const evpBytesToKey = (password, salt) => {
  const pw = Buffer.from(String(password), 'utf8');
  let block = Buffer.alloc(0);
  let derived = Buffer.alloc(0);
  while (derived.length < 48) { // 32-byte key + 16-byte IV
    block = crypto.createHash('md5').update(Buffer.concat([block, pw, salt])).digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) };
};

const decryptLegacy = (value) => {
  const data = Buffer.from(value, 'base64');
  // "Salted__" + 8-byte salt + ciphertext
  const salt = data.subarray(8, 16);
  const { key, iv } = evpBytesToKey(ENCRYPTION_KEY, salt);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]).toString('utf8');
};

/**
 * Encrypt a value for storage (always v2/GCM)
 * @param {string|number} value - The plaintext value to encrypt
 * @returns {string} Encrypted ciphertext
 */
const encrypt = (value) => {
  if (value === null || value === undefined) return null;
  return encryptV2(String(value));
};

/**
 * Decrypt a stored value (v2 or legacy CryptoJS format)
 * @param {string} ciphertext - The encrypted value
 * @returns {string|null} Decrypted plaintext, or null on failure / non-ciphertext
 */
const decrypt = (ciphertext) => {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') return null;
  // Legacy plaintext rows (never encrypted) must not be forced through AES.
  if (!isEncrypted(ciphertext)) return String(ciphertext);
  try {
    const decrypted = String(ciphertext).startsWith(V2_PREFIX)
      ? decryptV2(String(ciphertext))
      : decryptLegacy(String(ciphertext));
    // Wrong key / tampered ciphertext → throw (caught below) or empty output;
    // never return garbage.
    if (!decrypted) return null;
    return decrypted;
  } catch (error) {
    // GCM auth failure / CBC bad padding — wrong key or tampering.
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
 * Check if a value appears to be ciphertext in either supported format
 * @param {string} value
 * @returns {boolean}
 */
const isEncrypted = (value) => {
  if (typeof value !== 'string') return false;
  if (value.startsWith(V2_PREFIX) && value.length > V2_PREFIX.length + 20) return true;
  // Legacy CryptoJS AES strings are Base64 starting "U2Fsd" ("Salted__")
  return value.length > 20 && /^U2Fsd/.test(value);
};

module.exports = {
  encrypt,
  decrypt,
  decryptNumber,
  encryptFields,
  decryptFields,
  isEncrypted,
  _resolveEncryptionKey: resolveEncryptionKey,
  _assertKeyStrength: assertKeyStrength,
};
