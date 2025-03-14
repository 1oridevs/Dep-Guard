// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DEBUG = 'false';
process.env.SILENT = 'false';

// Global test timeout
jest.setTimeout(10000);

// Mock fs for certain tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    ...jest.requireActual('fs').promises,
    // Add any fs mocks here if needed
  }
}));

// Clean up after tests
afterAll(() => {
  // Any cleanup needed
}); 