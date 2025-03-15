const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');
const versionUtils = require('../../utils/version-utils');
const licenseUtils = require('../../utils/license-utils');
const { NetworkError } = require('../../utils/error-utils');

class DependencyScanner {
  constructor(options = {}) {
    this.npmRegistry = options.registry || process.env.NPM_REGISTRY || 'https://registry.npmjs.org';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
    this.cache = cache;
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

  async retryOperation(operation, { retries = this.maxRetries, delay = this.retryDelay } = {}) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  async readPackageJson(projectPath = process.cwd()) {
    try {
      const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to read package.json: ${error.message}`);
    }
  }

  async getPackageInfo(packageName) {
    const cacheKey = `pkg:${this.npmRegistry}/${packageName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.npmRegistry}/${packageName}`);
      const data = response.data;

      const info = {
        latest: data['dist-tags'].latest,
        versions: Object.keys(data.versions),
        license: data.license,
        deprecated: data.deprecated,
        homepage: data.homepage
      };

      this.cache.set(cacheKey, info);
      return info;
    } catch (error) {
      throw new NetworkError(`Failed to fetch package info: ${error.message}`, {
        package: packageName,
        registry: this.npmRegistry
      });
    }
  }

  getUpdateType(currentVersion, latestVersion) {
    return versionUtils.determineUpdateType(currentVersion, latestVersion);
  }

  async scanDependencies(projectPath = process.cwd()) {
    try {
      // Read package.json first
      const packageJson = await this.readPackageJson(projectPath);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      if (Object.keys(dependencies).length === 0) {
        logger.info('No dependencies found in package.json');
        return {};
      }

      const results = {};
      for (const [name, version] of Object.entries(dependencies)) {
        try {
          const info = await this.getPackageInfo(name);
          results[name] = {
            currentVersion: version,
            latestVersion: info.latest,
            versions: info.versions,
            license: info.license,
            deprecated: info.deprecated,
            homepage: info.homepage
          };
        } catch (error) {
          logger.debug(`Failed to get info for ${name}:`, error);
          results[name] = {
            currentVersion: version,
            error: error.message
          };
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to scan dependencies:', error);
      throw error;
    }
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