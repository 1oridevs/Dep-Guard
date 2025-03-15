const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const cacheManager = require('../managers/cache-manager');
const versionUtils = require('../../utils/version-utils');
const licenseUtils = require('../../utils/license-utils');
const CacheManager = require('../managers/cache-manager');
const { NetworkError } = require('../../utils/error-utils');

class DependencyScanner {
  constructor(options = {}) {
    this.npmRegistry = options.registry || process.env.NPM_REGISTRY || 'https://registry.npmjs.org';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
    this.cacheManager = new CacheManager({
      ttl: options.cacheTimeout || 3600000,
      persistPath: options.cachePath,
      maxKeys: options.maxCacheKeys
    });
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
    const cacheKey = `pkg:${this.npmRegistry}/${packageName}`;
    return this.cacheManager.get(cacheKey, async () => {
      try {
        const response = await this.retryOperation(() => 
          axios.get(`${this.npmRegistry}/${packageName}`, {
            timeout: this.timeout,
            headers: {
              'User-Agent': 'dependency-guardian'
            }
          })
        );
        return response.data;
      } catch (error) {
        if (error.response?.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch package info: ${error.message}`);
      }
    });
  }

  getUpdateType(currentVersion, latestVersion) {
    return versionUtils.determineUpdateType(currentVersion, latestVersion);
  }

  async scanDependencies(dependencies) {
    const results = [];
    const packageNames = Object.keys(dependencies);
    
    try {
      const packageInfos = await this.cacheManager.mget(
        packageNames.map(name => `pkg:${this.npmRegistry}/${name}`),
        async (missingKeys) => {
          const infos = {};
          for (const key of missingKeys) {
            const name = key.split('/').pop();
            try {
              const info = await this.getPackageInfo(name);
              infos[key] = info;
            } catch (error) {
              if (error.response?.status === 404) {
                infos[key] = null;
              } else {
                throw error;
              }
            }
          }
          return infos;
        }
      );

      for (const [name, version] of Object.entries(dependencies)) {
        const packageInfo = packageInfos[`pkg:${this.npmRegistry}/${name}`];
        if (!packageInfo) {
          results.push({
            name,
            version,
            error: 'Package not found'
          });
          continue;
        }

        try {
          const result = await this.analyzeDependency(name, version, packageInfo);
          results.push(result);
        } catch (error) {
          results.push({
            name,
            version,
            error: error.message
          });
        }
      }
    } catch (error) {
      throw new NetworkError('Failed to scan dependencies', {
        error: error.message,
        packages: packageNames
      });
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