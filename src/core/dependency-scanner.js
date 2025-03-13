const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const semver = require('semver');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const Dependency = require('../models/dependency');

class DependencyScanner {
  constructor() {
    this.cache = cache;
  }

  async readPackageJson(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to read package.json:', error);
      throw new Error('Could not read package.json');
    }
  }

  async scanDependencies(dependencies, type = 'dependencies') {
    const results = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const dep = new Dependency(name, version, type);
        const latestVersion = await this.getLatestVersion(name);
        
        dep.latestVersion = latestVersion;
        dep.updateType = this.determineUpdateType(version, latestVersion);
        dep.suggestedUpdate = this.getSuggestedUpdate(version, latestVersion);
        
        results.push(dep);
      } catch (error) {
        logger.debug(`Failed to scan dependency ${name}:`, error);
        results.push(new Dependency(name, version, type));
      }
    }

    return results;
  }

  async getLatestVersion(packageName) {
    const cacheKey = `npm-version-${packageName}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
      const latestVersion = response.data['dist-tags'].latest;
      
      this.cache.set(cacheKey, latestVersion);
      return latestVersion;
    } catch (error) {
      logger.debug(`Failed to get latest version for ${packageName}:`, error);
      throw new Error(`Could not fetch latest version for ${packageName}`);
    }
  }

  determineUpdateType(currentVersion, latestVersion) {
    if (!semver.valid(semver.clean(currentVersion)) || !semver.valid(latestVersion)) {
      return 'unknown';
    }

    const current = semver.clean(currentVersion);
    
    if (semver.eq(current, latestVersion)) {
      return 'current';
    }

    if (semver.major(latestVersion) > semver.major(current)) {
      return 'major';
    }

    if (semver.minor(latestVersion) > semver.minor(current)) {
      return 'minor';
    }

    if (semver.patch(latestVersion) > semver.patch(current)) {
      return 'patch';
    }

    return 'unknown';
  }

  getSuggestedUpdate(currentVersion, latestVersion) {
    if (!semver.valid(semver.clean(currentVersion)) || !semver.valid(latestVersion)) {
      return null;
    }

    const current = semver.clean(currentVersion);
    
    if (semver.eq(current, latestVersion)) {
      return null;
    }

    // Suggest the next safe version based on semver
    const major = semver.major(current);
    const minor = semver.minor(current);
    const patch = semver.patch(current);

    if (semver.satisfies(latestVersion, `^${major}.${minor}.${patch}`)) {
      return latestVersion; // Safe update within current range
    }

    if (semver.satisfies(latestVersion, `^${major}.0.0`)) {
      return `^${major}.${semver.minor(latestVersion)}.0`; // Safe minor update
    }

    return `^${semver.major(latestVersion)}.0.0`; // Major update (breaking changes)
  }
}

module.exports = new DependencyScanner(); 