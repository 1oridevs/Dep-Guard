const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');
const versionUtils = require('../../utils/version-utils');
const licenseUtils = require('../../utils/license-utils');

class DependencyScanner {
  constructor() {
    this.npmRegistry = 'https://registry.npmjs.org';
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour
    this.requestQueue = [];
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now(),
      maxRequests: 100,
      timeWindow: 60000 // 1 minute
    };
  }

  async throttleRequest() {
    const now = Date.now();
    if (now - this.rateLimit.resetTime > this.rateLimit.timeWindow) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = now;
    }

    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      const delay = this.rateLimit.resetTime + this.rateLimit.timeWindow - now;
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.throttleRequest();
    }

    this.rateLimit.requests++;
  }

  async readPackageJson(projectPath) {
    try {
      const content = await fs.readFile(path.join(projectPath || process.cwd(), 'package.json'), 'utf8');
      const packageJson = JSON.parse(content);
      
      // Validate package.json structure
      if (!packageJson || typeof packageJson !== 'object') {
        throw new Error('Invalid package.json format');
      }
      
      // Validate dependencies
      if (packageJson.dependencies && typeof packageJson.dependencies !== 'object') {
        throw new Error('Invalid dependencies format in package.json');
      }
      
      // Validate devDependencies
      if (packageJson.devDependencies && typeof packageJson.devDependencies !== 'object') {
        throw new Error('Invalid devDependencies format in package.json');
      }
      
      return packageJson;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Could not find package.json');
      }
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON in package.json');
      }
      logger.error('Failed to read package.json:', error);
      throw new Error('Could not read package.json');
    }
  }

  async getPackageInfo(packageName) {
    try {
      const response = await axios.get(`${this.npmRegistry}/${packageName}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  getUpdateType(currentVersion, latestVersion) {
    return versionUtils.determineUpdateType(currentVersion, latestVersion);
  }

  async scanDependencies(dependencies) {
    const results = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const packageInfo = await this.getPackageInfo(name);
        if (!packageInfo) {
          results.push({
            name,
            version,
            error: 'No package info returned'
          });
          continue;
        }

        const result = await this.analyzeDependency(name, version, packageInfo);
        results.push(result);
      } catch (error) {
        logger.warn(`Network error fetching package ${name}: ${error.message}`);
        results.push({
          name,
          version,
          error: error.message
        });
      }
    }

    return results;
  }

  async analyzeDependency(name, version, packageInfo) {
    if (!packageInfo['dist-tags'] || !packageInfo.versions) {
      throw new Error('Invalid package info structure');
    }

    return {
      name,
      version,
      currentVersion: packageInfo['dist-tags'].latest,
      latestVersion: packageInfo['dist-tags'].latest,
      license: packageInfo.versions[packageInfo['dist-tags'].latest]?.license || 'UNKNOWN',
      updateType: this.getUpdateType(version, packageInfo['dist-tags'].latest),
      issues: []
    };
  }
}

module.exports = new DependencyScanner(); 