const axios = require('axios');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

class LicenseChecker {
  constructor() {
    this.cache = cache;
  }

  async checkLicense(packageName, version) {
    const cacheKey = `license-${packageName}@${version}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://registry.npmjs.org/${packageName}/${version}`);
      const licenseInfo = {
        name: response.data.license,
        url: this.getLicenseUrl(response.data.license),
        type: this.categorizeLicense(response.data.license)
      };

      this.cache.set(cacheKey, licenseInfo);
      return licenseInfo;
    } catch (error) {
      logger.debug(`Failed to check license for ${packageName}@${version}:`, error);
      return null;
    }
  }

  categorizeLicense(license) {
    const permissive = ['MIT', 'ISC', 'BSD-3-Clause', 'Apache-2.0'];
    const copyleft = ['GPL', 'LGPL', 'AGPL'];
    const commercial = ['Commercial', 'Proprietary'];

    if (!license) return 'unknown';
    if (permissive.some(l => license.includes(l))) return 'permissive';
    if (copyleft.some(l => license.includes(l))) return 'copyleft';
    if (commercial.some(l => license.includes(l))) return 'commercial';
    return 'other';
  }

  getLicenseUrl(license) {
    const licenseUrls = {
      'MIT': 'https://opensource.org/licenses/MIT',
      'ISC': 'https://opensource.org/licenses/ISC',
      'Apache-2.0': 'https://opensource.org/licenses/Apache-2.0',
      'BSD-3-Clause': 'https://opensource.org/licenses/BSD-3-Clause',
      'GPL-3.0': 'https://www.gnu.org/licenses/gpl-3.0.en.html',
      'LGPL-3.0': 'https://www.gnu.org/licenses/lgpl-3.0.en.html'
    };

    return licenseUrls[license] || null;
  }

  validateLicensePolicy(license, policy) {
    if (!license) {
      return policy.licenses.unknown === 'allow' ? null : {
        type: 'license',
        level: policy.licenses.unknown === 'warn' ? 'warning' : 'high',
        message: 'Unknown license'
      };
    }

    if (policy.licenses.blocked.some(l => license.includes(l))) {
      return {
        type: 'license',
        level: 'high',
        message: `License ${license} is blocked by policy`
      };
    }

    if (!policy.licenses.allowed.some(l => license.includes(l))) {
      return {
        type: 'license',
        level: 'high',
        message: `License ${license} is not in allowed list`
      };
    }

    return null;
  }
}

module.exports = new LicenseChecker(); 