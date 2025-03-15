const versionUtils = require('../../../src/utils/version-utils');
const VersionChecker = require('../../../src/core/checkers/version-checker');

describe('VersionUtils', () => {
  describe('parseVersion', () => {
    test('should parse valid semver version', () => {
      const result = versionUtils.parseVersion('1.2.3');
      expect(result).toEqual({
        version: '1.2.3',
        isPreRelease: false,
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: [],
        range: 'exact'
      });
    });

    test('should parse version with caret', () => {
      const result = versionUtils.parseVersion('^1.2.3');
      expect(result).toEqual({
        version: '1.2.3',
        isPreRelease: false,
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: [],
        range: 'caret'
      });
    });

    test('should parse version with tilde', () => {
      const result = versionUtils.parseVersion('~1.2.3');
      expect(result).toEqual({
        version: '1.2.3',
        isPreRelease: false,
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: [],
        range: 'tilde'
      });
    });

    test('should identify pre-release versions', () => {
      const result = versionUtils.parseVersion('1.2.3-beta.1');
      expect(result).toEqual({
        version: '1.2.3-beta.1',
        isPreRelease: true,
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: ['beta', 1],
        range: 'exact'
      });
    });

    test('should return null for invalid versions', () => {
      const result = versionUtils.parseVersion('invalid');
      expect(result).toBeNull();
    });
  });

  describe('determineUpdateType', () => {
    test('should detect major updates', () => {
      expect(versionUtils.determineUpdateType('1.0.0', '2.0.0')).toBe('major');
    });

    test('should detect minor updates', () => {
      expect(versionUtils.determineUpdateType('1.0.0', '1.1.0')).toBe('minor');
    });

    test('should detect patch updates', () => {
      expect(versionUtils.determineUpdateType('1.0.0', '1.0.1')).toBe('patch');
    });

    test('should return current for same versions', () => {
      expect(versionUtils.determineUpdateType('1.0.0', '1.0.0')).toBe('current');
    });

    test('should handle pre-release versions', () => {
      expect(versionUtils.determineUpdateType('1.0.0', '2.0.0-beta.1')).toBe('major');
    });
  });

  describe('satisfies', () => {
    test('should check version satisfaction', () => {
      expect(versionUtils.satisfies('1.2.3', '^1.0.0')).toBe(true);
      expect(versionUtils.satisfies('2.0.0', '^1.0.0')).toBe(false);
    });

    test('should handle invalid versions', () => {
      expect(versionUtils.satisfies('invalid', '^1.0.0')).toBe(false);
    });
  });

  describe('sortVersions', () => {
    test('should sort versions ascending', () => {
      const versions = ['1.0.0', '2.0.0', '1.5.0'];
      expect(versionUtils.sortVersions(versions)).toEqual(['1.0.0', '1.5.0', '2.0.0']);
    });

    test('should sort versions descending', () => {
      const versions = ['1.0.0', '2.0.0', '1.5.0'];
      expect(versionUtils.sortVersions(versions, false)).toEqual(['2.0.0', '1.5.0', '1.0.0']);
    });
  });
});

describe('VersionChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new VersionChecker();
  });

  describe('getUpdateType', () => {
    it('should correctly identify major updates', () => {
      expect(checker.getUpdateType('1.0.0', '2.0.0')).toBe('major');
      expect(checker.getUpdateType('1.2.3', '2.0.0')).toBe('major');
    });

    it('should correctly identify minor updates', () => {
      expect(checker.getUpdateType('1.0.0', '1.1.0')).toBe('minor');
      expect(checker.getUpdateType('1.2.3', '1.3.0')).toBe('minor');
    });

    it('should correctly identify patch updates', () => {
      expect(checker.getUpdateType('1.0.0', '1.0.1')).toBe('patch');
      expect(checker.getUpdateType('1.2.3', '1.2.4')).toBe('patch');
    });

    it('should handle invalid versions', () => {
      expect(checker.getUpdateType(null, '1.0.0')).toBeNull();
      expect(checker.getUpdateType('1.0.0', null)).toBeNull();
      expect(checker.getUpdateType('invalid', '1.0.0')).toBeNull();
    });
  });

  describe('categorizeUpdates', () => {
    it('should correctly categorize updates', () => {
      const outdated = {
        'pkg1': { current: '1.0.0', wanted: '1.0.1', latest: '2.0.0' },
        'pkg2': { current: '1.0.0', wanted: '1.1.0', latest: '1.1.0' },
        'pkg3': { current: '1.0.0', wanted: '1.0.1', latest: '1.0.1' }
      };

      const result = checker.categorizeUpdates(outdated);
      expect(result.major).toHaveLength(1);
      expect(result.minor).toHaveLength(1);
      expect(result.patch).toHaveLength(1);
    });
  });
});