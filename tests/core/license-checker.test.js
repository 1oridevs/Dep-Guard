const licenseChecker = require('../../src/core/license-checker');
const axios = require('axios');

jest.mock('axios');

describe('LicenseChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    licenseChecker.spdxLicenses = null;
  });

  describe('loadSPDXLicenses', () => {
    it('should load and cache SPDX licenses', async () => {
      const mockLicenses = {
        licenses: [
          { licenseId: 'MIT', reference: 'https://opensource.org/licenses/MIT' },
          { licenseId: 'Apache-2.0', reference: 'https://opensource.org/licenses/Apache-2.0' }
        ]
      };

      axios.get.mockResolvedValue({ data: mockLicenses });

      await licenseChecker.loadSPDXLicenses();

      expect(licenseChecker.spdxLicenses).toEqual({
        'MIT': mockLicenses.licenses[0],
        'Apache-2.0': mockLicenses.licenses[1]
      });
    });

    it('should handle failed SPDX license loading', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await licenseChecker.loadSPDXLicenses();
      expect(licenseChecker.spdxLicenses).toEqual({});
    });
  });

  describe('checkLicense', () => {
    beforeEach(async () => {
      const mockLicenses = {
        licenses: [
          { licenseId: 'MIT', reference: 'https://opensource.org/licenses/MIT' }
        ]
      };
      axios.get.mockResolvedValueOnce({ data: mockLicenses });
      await licenseChecker.init();
      axios.get.mockClear();
    });

    it('should check package license successfully', async () => {
      axios.get.mockResolvedValue({
        data: {
          license: 'MIT'
        }
      });

      const result = await licenseChecker.checkLicense('test-pkg', '1.0.0');
      expect(result).toEqual({
        name: 'MIT',
        valid: true,
        url: 'https://opensource.org/licenses/MIT'
      });
    });

    it('should handle unknown licenses', async () => {
      axios.get.mockResolvedValue({
        data: {
          license: 'UNKNOWN'
        }
      });

      const result = await licenseChecker.checkLicense('test-pkg', '1.0.0');
      expect(result).toEqual({
        name: 'UNKNOWN',
        valid: false,
        url: null
      });
    });
  });

  describe('isLicenseAllowed', () => {
    beforeEach(async () => {
      const mockLicenses = {
        licenses: [
          { licenseId: 'MIT', reference: 'https://opensource.org/licenses/MIT' }
        ]
      };
      axios.get.mockResolvedValueOnce({ data: mockLicenses });
      await licenseChecker.init();
    });

    it('should return true for allowed licenses', async () => {
      const result = await licenseChecker.isLicenseAllowed('MIT', ['MIT', 'Apache-2.0']);
      expect(result).toBe(true);
    });

    it('should return false for disallowed licenses', async () => {
      const result = await licenseChecker.isLicenseAllowed('GPL', ['MIT', 'Apache-2.0']);
      expect(result).toBe(false);
    });
  });
}); 