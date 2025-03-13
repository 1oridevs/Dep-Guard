const axios = require('axios');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class LicenseChecker {
  constructor() {
    this.cache = cache;
    this.spdxLicenses = null;
  }

  async init() {
    if (!this.spdxLicenses) {
      await this.loadSPDXLicenses();
    }
  }

  async loadSPDXLicenses() {
    const cacheKey = 'spdx-licenses';
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      this.spdxLicenses = cached;
      return;
    }

    try {
      const response = await axios.get('https://raw.githubusercontent.com/spdx/license-list-data/master/json/licenses.json');
      this.spdxLicenses = response.data.licenses.reduce((acc, license) => {
        acc[license.licenseId] = license;
        return acc;
      }, {});
      
      this.cache.set(cacheKey, this.spdxLicenses, 86400); // Cache for 24 hours
    } catch (error) {
      logger.error('Failed to load SPDX licenses:', error);
      this.spdxLicenses = {};
    }
  }

  async checkLicense(packageName, version) {
    const cacheKey = `license-${packageName}@${version}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://registry.npmjs.org/${packageName}/${version}`);
      const license = response.data.license;
      const result = await this.validateLicense(license);
      
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.debug(`Failed to check license for ${packageName}:`, error);
      return {
        name: 'UNKNOWN',
        valid: false,
        url: null
      };
    }
  }

  async validateLicense(license) {
    await this.init();

    if (!license) {
      return {
        name: 'UNLICENSED',
        valid: false,
        url: null
      };
    }

    // Handle license objects
    if (typeof license === 'object') {
      license = license.type || 'UNKNOWN';
    }

    const spdxLicense = this.spdxLicenses[license];
    
    return {
      name: license,
      valid: !!spdxLicense,
      url: spdxLicense ? spdxLicense.reference : null
    };
  }

  async isLicenseAllowed(license, allowedLicenses) {
    if (!license || !allowedLicenses) {
      return false;
    }

    const validation = await this.validateLicense(license);
    return validation.valid && allowedLicenses.includes(validation.name);
  }
}

module.exports = new LicenseChecker(); 