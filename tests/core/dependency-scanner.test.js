const dependencyScanner = require('../../src/core/dependency-scanner');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

jest.mock('axios');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

describe('DependencyScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readPackageJson', () => {
    it('should read and parse package.json successfully', async () => {
      const mockPackageJson = {
        dependencies: {
          'test-pkg': '1.0.0'
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await dependencyScanner.readPackageJson('/test/path');
      expect(result).toEqual(mockPackageJson);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join('/test/path', 'package.json'),
        'utf8'
      );
    });

    it('should throw error when package.json cannot be read', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(dependencyScanner.readPackageJson('/test/path'))
        .rejects
        .toThrow('Could not read package.json');
    });
  });

  describe('getLatestVersion', () => {
    it('should fetch and return latest version', async () => {
      axios.get.mockResolvedValue({
        data: {
          'dist-tags': {
            latest: '2.0.0'
          }
        }
      });

      const version = await dependencyScanner.getLatestVersion('test-pkg');
      expect(version).toBe('2.0.0');
      expect(axios.get).toHaveBeenCalledWith(
        'https://registry.npmjs.org/test-pkg'
      );
    });

    it('should throw error when version cannot be fetched', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(dependencyScanner.getLatestVersion('test-pkg'))
        .rejects
        .toThrow('Could not fetch latest version for test-pkg');
    });
  });

  describe('determineUpdateType', () => {
    it('should identify major updates', () => {
      const result = dependencyScanner.determineUpdateType('1.0.0', '2.0.0');
      expect(result).toBe('major');
    });

    it('should identify minor updates', () => {
      const result = dependencyScanner.determineUpdateType('1.0.0', '1.1.0');
      expect(result).toBe('minor');
    });

    it('should identify patch updates', () => {
      const result = dependencyScanner.determineUpdateType('1.0.0', '1.0.1');
      expect(result).toBe('patch');
    });

    it('should handle current versions', () => {
      const result = dependencyScanner.determineUpdateType('1.0.0', '1.0.0');
      expect(result).toBe('current');
    });
  });
}); 