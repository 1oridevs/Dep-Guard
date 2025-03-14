const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');
const versionUtils = require('../../utils/version-utils');
const licenseUtils = require('../../utils/license-utils');

class DependencyScanner {
  constructor() {
    this.cache = cache;
    this.npmRegistry = 'https://registry.npmjs.org';
  }

  async readPackageJson(projectPath) {
    try {
      const content = await fs.readFile(path.join(projectPath || process.cwd(), 'package.json'), 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to read package.json:', error);
      throw new Error('Could not read package.json');
    }
  }

  async getPackageInfo(name) {
    const cacheKey = `npm-pkg-${name}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`${this.npmRegistry}/${name}`);
      this.cache.set(cacheKey, response.data, 3600); // Cache for 1 hour
      return response.data;
    } catch (error) {
      logger.debug(`Failed to fetch package info for ${name}:`, error);
      return null;
    }
  }

  async scanDependencies(dependencies) {
    const results = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        // Get package info from npm
        const packageInfo = await this.getPackageInfo(name);
        if (!packageInfo) {
          logger.warn(`Could not fetch info for package: ${name}`);
          continue;
        }

        // Get latest version
        const latestVersion = packageInfo['dist-tags']?.latest;
        
        // Get license info
        const licenseInfo = packageInfo.versions?.[latestVersion]?.license || packageInfo.license;

        // Create dependency object
        const dep = {
          name,
          version: version,
          currentVersion: version.replace(/^[\^~]/, ''),
          latestVersion,
          updateType: versionUtils.determineUpdateType(version, latestVersion),
          license: licenseInfo || 'UNKNOWN',
          issues: []
        };

        // Add to results
        results.push(dep);
      } catch (error) {
        logger.debug(`Error scanning dependency ${name}:`, error);
        results.push({
          name,
          version,
          latestVersion: null,
          updateType: 'unknown',
          license: 'UNKNOWN',
          issues: [{
            type: 'error',
            message: `Failed to scan: ${error.message}`
          }]
        });
      }
    }

    return results;
  }
}

module.exports = new DependencyScanner(); 