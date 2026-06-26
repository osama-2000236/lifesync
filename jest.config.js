// jest.config.js
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';

module.exports = {
  testEnvironment: 'node',
  verbose: true,
  forceExit: true,
  // Transform ESM packages that Jest can't handle natively
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  // Use babel to transform ESM imports
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
      ],
    }],
  },
  testTimeout: 10000,
  // Playwright owns the TypeScript QA specs (tests/qa) and all .spec files;
  // keep jest discovery isolated and off stale worktree copies.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/worktrees/',
    '/tests/qa/',
    '\\.spec\\.js$',
    '\\.spec\\.ts$',
  ],
};
