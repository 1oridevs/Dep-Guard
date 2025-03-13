const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const semver = require('semver');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

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

  async scanDependencies(dependencies) {
    const results = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        // Clean version string (remove ^ or ~ if present)
        const requestedVersion = version.replace(/[\^~]/g, '');
        
        // Get package info from npm
        const packageInfo = await this.getPackageInfo(name);
        if (!packageInfo) {
          logger.warn(`Could not fetch info for package: ${name}`);
          continue;
        }

        // Get latest version
        const latestVersion = packageInfo['dist-tags']?.latest;
        
        // Get the exact version info
        const versionInfo = packageInfo.versions?.[requestedVersion] || packageInfo.versions?.[latestVersion];
        
        // Get license info
        const license = versionInfo?.license || packageInfo.license;

        // Create dependency object
        const dep = {
          name,
          version: requestedVersion,
          latestVersion,
          currentVersion: requestedVersion,
          updateType: await this.determineUpdateType(name, requestedVersion, latestVersion),
          license: license || 'UNKNOWN',
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

  async getPackageInfo(packageName) {
    const cacheKey = `npm-info-${packageName}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`${this.npmRegistry}/${packageName}`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.data) {
        throw new Error('Empty response from NPM registry');
      }

      this.cache.set(cacheKey, response.data);
      return response.data;
    } catch (error) {
      logger.debug(`Failed to get package info for ${packageName}:`, error);
      return null;
    }
  }

  async determineUpdateType(packageName, currentVersion, latestVersion) {
    try {
      // Handle cases where versions are missing
      if (!currentVersion || !latestVersion) {
        return 'unknown';
      }

      // Clean and parse versions
      const current = semver.valid(semver.coerce(currentVersion));
      const latest = semver.valid(semver.coerce(latestVersion));

      if (!current || !latest) {
        logger.debug(`Invalid version format for ${packageName}: current=${currentVersion}, latest=${latestVersion}`);
        return 'unknown';
      }

      // Compare versions
      if (semver.eq(current, latest)) {
        return 'current';
      }

      if (semver.gt(latest, current)) {
        if (semver.major(latest) > semver.major(current)) {
          return 'major';
        }
        if (semver.minor(latest) > semver.minor(current)) {
          return 'minor';
        }
        if (semver.patch(latest) > semver.patch(current)) {
          return 'patch';
        }
      }

      return 'current';
    } catch (error) {
      logger.debug(`Error determining update type for ${packageName} (${currentVersion} -> ${latestVersion}):`, error);
      return 'unknown';
    }
  }

  async getLatestVersion(packageName) {
    const packageInfo = await this.getPackageInfo(packageName);
    return packageInfo?.['dist-tags']?.latest || null;
  }
}

module.exports = new DependencyScanner(); 