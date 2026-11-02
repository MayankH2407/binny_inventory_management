module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-.*|@react-navigation/.*|@tanstack/.*|zustand)/)',
  ],
  setupFilesAfterEnv: ['./jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['**/__tests__/**/*.(ts|tsx)', '**/*.test.(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/e2e-maestro/'],
  collectCoverageFrom: [
    'services/**/*.ts',
    'stores/**/*.ts',
    'hooks/**/*.ts',
    'utils/**/*.ts',
    'components/**/*.tsx',
    'app/**/*.tsx',
    '!**/*.d.ts',
  ],
};
