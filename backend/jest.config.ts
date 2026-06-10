import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  globals: {
    'ts-jest': {
      tsconfig: {
        // Relax strict checks that would break test files (e.g. noUnusedLocals)
        noUnusedLocals: false,
        noUnusedParameters: false,
        // Tests live under tests/ not src/, so we need a broader rootDir
        rootDir: '.',
      },
    },
  },
};

export default config;
