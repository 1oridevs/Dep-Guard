const dependencyScanner = require('../../../../src/core/analyzers/dependency-scanner');
const axios = require('axios');

jest.mock('axios');

describe('DependencyScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPackageInfo', () => {
    test('should fetch and cache package info', async () => {
      const mockData = {
        'dist-tags': { latest: '2.0.0' },
        versions: {
          '2.0.0': { license: 'MIT' }
        }
      };

      axios.get.mockResolvedValueOnce({ data: mockData });

      const result = await dependencyScanner.getPackageInfo('test-package');
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith('https://registry.npmjs.org/test-package');
    });

    test('should handle network errors', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));
      const result = await dependencyScanner.getPackageInfo('test-package');
      expect(result).toBeNull();
    });
  });

  describe('scanDependencies', () => {
    test('should scan multiple dependencies', async () => {
      const mockDeps = {
        'package-1': '^1.0.0',
        'package-2': '~2.0.0'
      };

      const mockPackageInfo = {
        'dist-tags': { latest: '2.0.0' },
        versions: {
          '2.0.0': { license: 'MIT' }
        }
      };

      axios.get.mockResolvedValue({ data: mockPackageInfo });

      const results = await dependencyScanner.scanDependencies(mockDeps);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('version');
      expect(results[0]).toHaveProperty('latestVersion');
    });
  });
}); 