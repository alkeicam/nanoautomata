module.exports = {  
  testEnvironment: 'node',
  // setupFilesAfterEnv: ['./jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  }  
};