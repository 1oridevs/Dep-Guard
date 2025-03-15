const axios = require('axios');
const logger = require('./logger');
const cache = require('./cache');

class LicenseUtils {
  constructor() {
    this.cache = cache;
    this.spdxLicenses = null;
    this.customMappings = new Map();
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
        acc[license.licenseId] = {
          ...license,
          aliases: this.generateLicenseAliases(license.licenseId)
        };
        return acc;
      }, {});
      
      this.cache.set(cacheKey, this.spdxLicenses, 86400); // Cache for 24 hours
    } catch (error) {
      logger.error('Failed to load SPDX licenses:', error);
      this.spdxLicenses = {};
    }
  }

  generateLicenseAliases(licenseId) {
    const aliases = new Set([licenseId]);
    
    // Add common variations
    aliases.add(licenseId.toLowerCase());
    aliases.add(licenseId.replace(/-/g, ''));
    aliases.add(licenseId.replace(/\s/g, ''));

    // Add specific known aliases
    const knownAliases = {
      'MIT': ['MIT License', 'MIT-0', 'MIT No Attribution'],
      'Apache-2.0': ['Apache 2', 'Apache2', 'Apache License 2.0'],
      'GPL-3.0': ['GPL3', 'GPLv3', 'GNU GPL v3'],
      'ISC': ['ISC License', 'ISC Public License']
    };

    knownAliases[licenseId]?.forEach(alias => aliases.add(alias));
    return Array.from(aliases);
  }

  addCustomMapping(customLicense, spdxLicense) {
    this.customMappings.set(customLicense.toLowerCase(), spdxLicense);
  }

  async detectLicense(packageInfo) {
    const licenses = new Set();

    // Check package.json license field
    if (typeof packageInfo.license === 'string') {
      licenses.add(this.normalizeLicense(packageInfo.license));
    } else if (typeof packageInfo.license === 'object') {
      licenses.add(this.normalizeLicense(packageInfo.license.type));
    }

    // Check licenses array if present
    if (Array.isArray(packageInfo.licenses)) {
      packageInfo.licenses.forEach(license => {
        const normalized = this.normalizeLicense(
          typeof license === 'string' ? license : license.type
        );
        if (normalized) licenses.add(normalized);
      });
    }

    // Check license file content if available
    if (packageInfo.licenseFile) {
      const detectedFromFile = await this.detectLicenseFromContent(packageInfo.licenseFile);
      if (detectedFromFile) licenses.add(detectedFromFile);
    }

    return Array.from(licenses);
  }

  normalizeLicense(license) {
    if (!license) return null;

    // Convert to uppercase for consistent matching
    const normalized = license.toUpperCase();

    // MIT variations
    if (normalized.includes('MIT')) {
      return 'MIT';
    }

    // Apache variations
    if (normalized.includes('APACHE')) {
      const version = normalized.match(/2\.0|2|20/);
      return version ? 'Apache-2.0' : 'Apache';
    }

    // BSD variations
    if (normalized.includes('BSD')) {
      if (normalized.includes('3')) return 'BSD-3-Clause';
      if (normalized.includes('2')) return 'BSD-2-Clause';
      return 'BSD';
    }

    // Return original if no matches
    return license;
  }

  async detectLicenseFromContent(content) {
    // Implement license detection from file content
    // This would require natural language processing or pattern matching
    // Return the most likely SPDX identifier
    return null;
  }

  validateLicense(license) {
    if (!license) return false;
    return !!this.spdxLicenses[this.normalizeLicense(license)];
  }
}

module.exports = new LicenseUtils(); 