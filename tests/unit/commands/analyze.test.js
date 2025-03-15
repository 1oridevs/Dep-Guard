const analyzeCommand = require('../../../src/commands/analyze');
const DependencyScanner = require('../../../src/core/analyzers/dependency-scanner');
const logger = require('../../../src/utils/logger');
const fs = require('fs').promises;
const path = require('path');

jest.mock('../../../src/core/analyzers/dependency-scanner', () => {
  return jest.fn().mockImplementation(() => ({
    readPackageJson: jest.fn(),
    scanDependencies: jest.fn()
  }));
});

jest.mock('../../../src/utils/logger');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    access: jest.fn(),
    readFile: jest.fn()
  }
}));

describe('analyzeCommand', () => {
  let mockScanner;
  let mockExit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mockScanner = new DependencyScanner();
    
    // Reset mock implementations
    mockScanner.readPackageJson.mockReset();
    mockScanner.scanDependencies.mockReset();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should handle missing package.json', async () => {
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.access.mockRejectedValue({ code: 'ENOENT' });

    await analyzeCommand({ path: '/fake/path' });
    expect(logger.error).toHaveBeenCalledWith(
      'Analysis failed:',
      expect.stringContaining('package.json not found')
    );
  });

  it('should handle invalid project path', async () => {
    fs.stat.mockResolvedValue({ isDirectory: () => false });

    await expect(analyzeCommand({ path: 'not-a-directory' }))
      .rejects
      .toThrow('Project path must be a directory');
  });

  it('should handle timeout', async () => {
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.access.mockResolvedValue(true);
    
    mockScanner.readPackageJson.mockResolvedValue({
      dependencies: { 'test-pkg': '1.0.0' }
    });

    mockScanner.scanDependencies.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 2000))
    );

    await expect(analyzeCommand({ timeout: 100 }))
      .rejects
      .toThrow('Analysis timed out');
  });

  it('should handle scan errors', async () => {
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.access.mockResolvedValue(true);
    
    mockScanner.readPackageJson.mockResolvedValue({
      dependencies: { 'test-pkg': '1.0.0' }
    });

    mockScanner.scanDependencies.mockRejectedValue(
      new Error('Scan failed')
    );

    await expect(analyzeCommand({}))
      .rejects
      .toThrow('Scan failed');
  });

  it('should respect strict mode', async () => {
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.access.mockResolvedValue(true);
    
    mockScanner.readPackageJson.mockResolvedValue({
      dependencies: { 'test-pkg': '1.0.0' }
    });

    mockScanner.scanDependencies.mockResolvedValue([
      { name: 'test-pkg', version: '1.0.0', updateType: 'major' }
    ]);

    await analyzeCommand({ strict: true });
    expect(mockExit).toHaveBeenCalledWith(1);
  });
}); 