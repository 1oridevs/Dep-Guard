const licenseUtils = require('../../../src/utils/license-utils');

describe('LicenseUtils', () => {
  beforeAll(async () => {
    await licenseUtils.init();
  });

  describe('normalizeLicense', () => {
    test('should normalize MIT license variations', () => {
      expect(licenseUtils.normalizeLicense('MIT')).toBe('MIT');
      expect(licenseUtils.normalizeLicense('MIT License')).toBe('MIT');
      expect(licenseUtils.normalizeLicense('The MIT License')).toBe('MIT');
    });

    test('should normalize Apache license variations', () => {
      expect(licenseUtils.normalizeLicense('Apache-2.0')).toBe('Apache-2.0');
      expect(licenseUtils.normalizeLicense('Apache 2.0')).toBe('Apache-2.0');
      expect(licenseUtils.normalizeLicense('Apache License 2.0')).toBe('Apache-2.0');
    });

    test('should handle unknown licenses', () => {
      expect(licenseUtils.normalizeLicense('Unknown')).toBe('Unknown');
    });
  });

  describe('detectLicense', () => {
    test('should detect license from package.json string', async () => {
      const packageInfo = { license: 'MIT' };
      const result = await licenseUtils.detectLicense(packageInfo);
      expect(result).toContain('MIT');
    });

    test('should detect license from package.json object', async () => {
      const packageInfo = { license: { type: 'MIT' } };
      const result = await licenseUtils.detectLicense(packageInfo);
      expect(result).toContain('MIT');
    });

    test('should detect multiple licenses', async () => {
      const packageInfo = { licenses: ['MIT', 'Apache-2.0'] };
      const result = await licenseUtils.detectLicense(packageInfo);
      expect(result).toContain('MIT');
      expect(result).toContain('Apache-2.0');
    });
  });
}); 