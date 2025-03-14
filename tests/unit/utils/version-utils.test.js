const versionUtils = require('../../../src/utils/version-utils');

describe('VersionUtils', () => {
  describe('parseVersion', () => {
    test('should parse valid semver version', () => {
      const result = versionUtils.parseVersion('1.2.3');
      expect(result).toEqual({
        version: '1.2.3',
        isPreRelease: false,
        type: 'semver'
      });
    });

    test('should parse version with caret', () => {
      const result = versionUtils.parseVersion('^1.2.3');
      expect(result).toEqual({
        version: '1.2.3',
        isPreRelease: false,
        type: 'semver'
      });
    });

    test('should parse version with tilde', () => {
      const result = versionUtils.parseVersion('~1.2.3');
      expect(result).toEqual({
        version: '1.2.3',
        isPreRelease: false,
        type: 'semver'
      });
    });

    test('should identify pre-release versions', () => {
      const result = versionUtils.parseVersion('1.2.3-beta.1');
      expect(result).toEqual({
        version: '1.2.3-beta.1',
        isPreRelease: true,
        type: 'semver'
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
}); 