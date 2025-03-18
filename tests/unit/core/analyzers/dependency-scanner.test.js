const dependencyScanner = require('../../../../src/core/analyzers/dependency-scanner');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { ValidationError, NetworkError } = require('../../../../src/utils/error-utils');

jest.mock('axios');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  }
}));

describe('DependencyScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dependencyScanner.cache.clear();
  });

  describe('readPackageJson', () => {
    it('should throw ValidationError for invalid path', async () => {
      await expect(dependencyScanner.readPackageJson())
        .rejects
        .toThrow(ValidationError);
      
      await expect(dependencyScanner.readPackageJson(null))
        .rejects
        .toThrow('Invalid project path provided');
    });

    it('should throw ValidationError when package.json not found', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      
      await expect(dependencyScanner.readPackageJson('/fake/path'))
        .rejects
        .toThrow('package.json not found in specified path');
    });

    it('should throw ValidationError for invalid JSON', async () => {
      fs.readFile.mockResolvedValue('invalid json');
      
      await expect(dependencyScanner.readPackageJson('/fake/path'))
        .rejects
        .toThrow('Invalid package.json format');
    });

    it('should successfully read valid package.json', async () => {
      const mockPackage = { name: 'test', version: '1.0.0' };
      fs.readFile.mockResolvedValue(JSON.stringify(mockPackage));
      
      const result = await dependencyScanner.readPackageJson('/test/path');
      expect(result).toEqual(mockPackage);
    });
  });

  describe('getPackageInfo', () => {
    it('should throw ValidationError for invalid package name', async () => {
      await expect(dependencyScanner.getPackageInfo())
        .rejects
        .toThrow('Invalid package name');
    });

    it('should handle 404 errors', async () => {
      axios.get.mockRejectedValue({ response: { status: 404 } });
      
      await expect(dependencyScanner.getPackageInfo('nonexistent-pkg'))
        .rejects
        .toThrow('Package nonexistent-pkg not found');
    });

    it('should retry on network errors', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      
      await expect(dependencyScanner.getPackageInfo('test-pkg'))
        .rejects
        .toThrow(NetworkError);
      
      expect(axios.get).toHaveBeenCalledTimes(dependencyScanner.maxRetries);
    });

    it('should validate package info structure', async () => {
      axios.get.mockResolvedValue({ data: { invalid: 'structure' } });
      
      await expect(dependencyScanner.getPackageInfo('test-pkg'))
        .rejects
        .toThrow('Invalid package info returned for test-pkg');
    });

    it('should cache successful responses', async () => {
      const mockData = {
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': { license: 'MIT' }
        }
      };
      
      axios.get.mockResolvedValue({ data: mockData });
      
      await dependencyScanner.getPackageInfo('test-pkg');
      await dependencyScanner.getPackageInfo('test-pkg');
      
      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanDependencies', () => {
    it('should throw ValidationError for invalid dependencies input', async () => {
      await expect(dependencyScanner.scanDependencies(null))
        .rejects
        .toThrow('Invalid dependencies object');

      await expect(dependencyScanner.scanDependencies('not-an-object'))
        .rejects
        .toThrow('Invalid dependencies object');
    });

    it('should handle package info errors gracefully', async () => {
      const dependencies = {
        'test-pkg': '1.0.0'
      };

      axios.get.mockRejectedValue(new Error('Network error'));
      
      const results = await dependencyScanner.scanDependencies(dependencies);
      
      expect(results[0]).toMatchObject({
        name: 'test-pkg',
        version: '1.0.0',
        error: expect.any(String),
        type: 'network'
      });
    });

    it('should analyze valid dependencies', async () => {
      const dependencies = {
        'test-pkg': '1.0.0'
      };

      const mockData = {
        'dist-tags': { latest: '2.0.0' },
        versions: {
          '2.0.0': { license: 'MIT' }
        }
      };

      axios.get.mockResolvedValue({ data: mockData });
      
      const results = await dependencyScanner.scanDependencies(dependencies);
      
      expect(results[0]).toMatchObject({
        name: 'test-pkg',
        version: '1.0.0',
        currentVersion: '2.0.0',
        latestVersion: '2.0.0',
        license: 'MIT'
      });
    });
  });
}); 