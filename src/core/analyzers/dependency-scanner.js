const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');
const versionUtils = require('../../utils/version-utils');
const licenseUtils = require('../../utils/license-utils');
const { NetworkError, ValidationError } = require('../../utils/error-utils');

class DependencyScanner {
  constructor(options = {}) {
    this.npmRegistry = options.registry || process.env.NPM_REGISTRY || 'https://registry.npmjs.org';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
    this.cache = cache;
  }

  async readPackageJson(projectPath) {
    if (!projectPath || typeof projectPath !== 'string') {
      throw new ValidationError('Invalid project path provided');
    }

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new ValidationError('package.json not found in specified path');
      }
      if (error instanceof SyntaxError) {
        throw new ValidationError('Invalid package.json format');
      }
      throw error;
    }
  }

  async getPackageInfo(name, version) {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Invalid package name');
    }

    const cacheKey = `pkg:${name}@${version || 'latest'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const url = `${this.npmRegistry}/${encodeURIComponent(name)}`;
        const response = await axios.get(url, { timeout: this.timeout });
        
        if (!response.data || !response.data['dist-tags']) {
          throw new ValidationError(`Invalid package info returned for ${name}`);
        }

        this.cache.set(cacheKey, response.data);
        return response.data;
      } catch (error) {
        retries++;
        if (error.response?.status === 404) {
          throw new ValidationError(`Package ${name} not found`);
        }
        if (retries === this.maxRetries) {
          throw new NetworkError(
            `Failed to fetch package info for ${name} after ${this.maxRetries} retries`,
            { originalError: error }
          );
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  async scanDependencies(dependencies) {
    if (!dependencies || typeof dependencies !== 'object') {
      throw new ValidationError('Invalid dependencies object');
    }

    const results = [];
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const packageInfo = await this.getPackageInfo(name, version);
        results.push(await this.analyzeDependency(name, version, packageInfo));
      } catch (error) {
        logger.debug(`Error scanning dependency ${name}:`, error);
        results.push({
          name,
          version,
          error: error.message,
          type: error instanceof ValidationError ? 'validation' : 'network'
        });
      }
    }
    return results;
  }

  async analyzeDependency(name, version, packageInfo) {
    if (!packageInfo['dist-tags'] || !packageInfo.versions) {
      throw new ValidationError('Invalid package info structure');
    }

    return {
      name,
      version,
      currentVersion: packageInfo['dist-tags'].latest,
      latestVersion: packageInfo['dist-tags'].latest,
      license: packageInfo.versions[packageInfo['dist-tags'].latest]?.license || 'UNKNOWN',
      updateType: versionUtils.getUpdateType(version, packageInfo['dist-tags'].latest),
      issues: []
    };
  }
}

module.exports = new DependencyScanner(); 