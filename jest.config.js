module.exports = {
  roots: ['<rootDir>'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testPathIgnorePatterns: ["/node_modules/", "/tests/helpers/"],
  testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['<rootDir>/tests/helpers/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  // Floors sit just under the current numbers so a regression fails the build rather than
  // silently eroding. Raise them when coverage improves; never lower them to make a build pass.
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 56,
      functions: 73,
      lines: 83,
    },
  },
}
