const fs = require('fs').promises;
const path = require('path');
const lockAnalyzer = require('../../../../src/core/analyzers/lock-analyzer');
const { ValidationError } = require('../../../../src/utils/error-utils');

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    access: jest.fn()
  }
}));

describe('LockAnalyzer', () => {
  const testDir = '/test/project';
  const packageJson = {
    dependencies: {
      'test-pkg': '^1.0.0',
      'another-pkg': '~2.0.0'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeLockFile', () => {
    it('should return null when no lock files found', async () => {
      fs.access.mockRejectedValue(new Error('Not found'));
      
      const result = await lockAnalyzer.analyzeLockFile(testDir);
      expect(result).toBeNull();
    });

    it('should return null when package.json not found', async () => {
      fs.access.mockResolvedValue(undefined);
      fs.readFile.mockRejectedValue(new Error('Not found'));
      
      const result = await lockAnalyzer.analyzeLockFile(testDir);
      expect(result).toBeNull();
    });

    it('should analyze yarn.lock correctly', async () => {
      fs.access.mockImplementation(file => {
        if (file.endsWith('yarn.lock')) return Promise.resolve();
        return Promise.reject(new Error('Not found'));
      });

      fs.readFile.mockImplementation(file => {
        if (file.endsWith('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        if (file.endsWith('yarn.lock')) {
          return Promise.resolve(`
"test-pkg@^1.0.0":
  version "1.0.1"
"another-pkg@~2.0.0":
  version "2.0.1"
          `);
        }
      });

      const result = await lockAnalyzer.analyzeLockFile(testDir);
      expect(result.summary.lockFiles).toContain('yarn.lock');
      expect(result.summary.versionMismatches).toHaveLength(2);
      expect(result.details['test-pkg']).toBeDefined();
      expect(result.details['another-pkg']).toBeDefined();
    });

    it('should analyze package-lock.json correctly', async () => {
      fs.access.mockImplementation(file => {
        if (file.endsWith('package-lock.json')) return Promise.resolve();
        return Promise.reject(new Error('Not found'));
      });

      fs.readFile.mockImplementation(file => {
        if (file.endsWith('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        if (file.endsWith('package-lock.json')) {
          return Promise.resolve(JSON.stringify({
            packages: {
              '': {},
              'node_modules/test-pkg': {
                version: '1.0.1'
              },
              'node_modules/another-pkg': {
                version: '2.0.1'
              }
            }
          }));
        }
      });

      const result = await lockAnalyzer.analyzeLockFile(testDir);
      expect(result.summary.lockFiles).toContain('package-lock.json');
      expect(result.summary.versionMismatches).toHaveLength(2);
      expect(result.details['test-pkg']).toBeDefined();
      expect(result.details['another-pkg']).toBeDefined();
    });

    it('should handle invalid lock files', async () => {
      fs.access.mockResolvedValue(undefined);
      fs.readFile.mockImplementation(file => {
        if (file.endsWith('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        if (file.endsWith('yarn.lock')) {
          return Promise.resolve('invalid yaml');
        }
      });

      await expect(lockAnalyzer.analyzeLockFile(testDir))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('versionsMatch', () => {
    it('should handle caret ranges', () => {
      expect(lockAnalyzer.versionsMatch('^1.0.0', '1.0.1')).toBe(false);
      expect(lockAnalyzer.versionsMatch('^1.0.0', '1.0.0')).toBe(true);
    });

    it('should handle tilde ranges', () => {
      expect(lockAnalyzer.versionsMatch('~2.0.0', '2.0.1')).toBe(false);
      expect(lockAnalyzer.versionsMatch('~2.0.0', '2.0.0')).toBe(true);
    });
  });
}); 