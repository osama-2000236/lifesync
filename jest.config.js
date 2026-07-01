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
  // client/ has its own Vitest pipeline (client/src/**/*.test.jsx) — keep
  // root Jest scoped to the backend so the two runners never collide.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/worktrees/',
    '/tests/qa/',
    '/client/',
    '\\.spec\\.js$',
    '\\.spec\\.ts$',
  ],
  // Coverage is scoped to the new voice-assistant surface and gated at 100% —
  // this is the QA contract for the feature. Existing backend suites are
  // unaffected (they run under `npm test`).
  collectCoverageFrom: [
    'server/services/ai/crossDomainInterviewService.js',
    'server/controllers/assistantController.js',
    'server/routes/assistantRoutes.js',
    'server/routes/voiceRoutes.js',
  ],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
