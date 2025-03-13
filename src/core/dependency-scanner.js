const axios = require('axios');
const semver = require('semver');
const path = require('path');
const fs = require('fs').promises;
const cache = require('../utils/cache');
const logger = require('../utils/logger');

class DependencyScanner {
  async getLatestVersion(packageName) {
    try {
      const cacheKey = `latest-version-${packageName}`;
      const cachedVersion = cache.get(cacheKey);
      
      if (cachedVersion) {
        return cachedVersion;
      }

      const response = await axios.get(`https://registry.npmjs.org/${packageName}/latest`);
      const version = response.data.version;
      
      cache.set(cacheKey, version);
      return version;
    } catch (error) {
      throw new Error(`Failed to get latest version: ${error.message}`);
    }
  }

  async readPackageJson(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      return JSON.parse(packageJsonContent);
    } catch (error) {
      throw new Error(`Failed to read or parse package.json: ${error.message}`);
    }
  }

  async scanDependencies(dependencies) {
    const results = [];
    const total = Object.keys(dependencies).length;
    let processed = 0;

    for (const [name, version] of Object.entries(dependencies)) {
      processed++;
      logger.verbose(`Scanning ${name} (${processed}/${total})`);
      
      try {
        const latestVersion = await this.getLatestVersion(name);
        if (semver.lt(version.replace(/^\^|~/, ''), latestVersion)) {
          const diff = semver.diff(version.replace(/^\^|~/, ''), latestVersion);
          results.push({
            name,
            currentVersion: version,
            latestVersion,
            status: diff || 'outdated',
            updateType: diff
          });
        }
      } catch (error) {
        logger.warn(`Failed to check ${name}: ${error.message}`);
      }
    }

    return results;
  }
}

module.exports = new DependencyScanner(); 