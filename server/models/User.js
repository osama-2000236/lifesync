// server/models/User.js
// ============================================
// User Model
// Supports both Firebase Auth and local auth
// ============================================

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('users', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  firebase_uid: {
    type: DataTypes.STRING(128),
    allowNull: true,
    unique: true,
    comment: 'Firebase Auth UID for OAuth/social login users',
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50],
      is: /^[a-zA-Z0-9_]+$/i, // Alphanumeric + underscore only
    },
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  verified_email: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether the user has verified their email address',
  },
  hashed_password: {
    type: DataTypes.STRING(255),
    allowNull: true, // Nullable for OAuth-only users
    comment: 'bcrypt-hashed password',
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    allowNull: false,
    defaultValue: 'user',
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  hooks: {
    /**
     * Automatically hash password before creating a user
     */
    beforeCreate: async (user) => {
      if (user.hashed_password) {
        const salt = await bcrypt.genSalt(12);
        user.hashed_password = await bcrypt.hash(user.hashed_password, salt);
      }
    },
    /**
     * Hash password on update if it changed
     */
    beforeUpdate: async (user) => {
      if (user.changed('hashed_password') && user.hashed_password) {
        const salt = await bcrypt.genSalt(12);
        user.hashed_password = await bcrypt.hash(user.hashed_password, salt);
      }
    },
  },
});

/**
 * Instance method: Compare plaintext password against hash
 * @param {string} candidatePassword - The plaintext password to verify
 * @returns {boolean}
 */
User.prototype.comparePassword = async function (candidatePassword) {
  if (!this.hashed_password) return false;
  return bcrypt.compare(candidatePassword, this.hashed_password);
};

/**
 * Instance method: Return user data without sensitive fields
 * @returns {Object}
 */
User.prototype.toSafeJSON = function () {
  const values = { ...this.get() };
  delete values.hashed_password;
  delete values.firebase_uid;
  return values;
};

module.exports = User;
