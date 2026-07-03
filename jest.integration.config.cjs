module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/test/setup/load-gaslibs.cjs'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.eslint.json' }] },
  clearMocks: true
};
