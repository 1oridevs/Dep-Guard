const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../../utils/logger');

class LicenseChecker {
  async check() {
    try {
      const licenses = await this.getLicenses();
      return this.analyzeLicenses(licenses);
    } catch (error) {
      logger.error('License check failed:', error);
      return {
        compliant: [],
        violations: [],
        unknown: []
      };
    }
  }

  async getLicenses() {
    const { stdout } = await execPromise('npm ls --json --all');
    const packages = JSON.parse(stdout);
    return this.extractLicenses(packages);
  }

  extractLicenses(packages, path = []) {
    const licenses = [];
    const deps = packages.dependencies || {};

    Object.entries(deps).forEach(([name, info]) => {
      if (info.license) {
        licenses.push({
          name,
          version: info.version,
          license: info.license,
          path: [...path, name].join('/')
        });
      }

      if (info.dependencies) {
        licenses.push(...this.extractLicenses(info, [...path, name]));
      }
    });

    return licenses;
  }

  analyzeLicenses(licenses) {
    const allowedLicenses = ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'];
    
    return {
      compliant: licenses.filter(l => allowedLicenses.includes(l.license)),
      violations: licenses.filter(l => l.license && !allowedLicenses.includes(l.license)),
      unknown: licenses.filter(l => !l.license)
    };
  }
}

module.exports = new LicenseChecker(); 