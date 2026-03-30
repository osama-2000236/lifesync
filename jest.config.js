// jest.config.js
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
};
