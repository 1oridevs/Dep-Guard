const axios = require('axios');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

class BundleAnalyzer {
  constructor() {
    this.cache = cache;
  }

  async analyzeBundleSize(packageName, version) {
    const cacheKey = `bundle-size-${packageName}@${version}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://bundlephobia.com/api/size?package=${packageName}@${version}`);
      const data = {
        size: response.data.size,
        gzip: response.data.gzip,
        dependencyCount: response.data.dependencyCount
      };

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      logger.debug(`Bundle size analysis failed for ${packageName}:`, error);
      return null;
    }
  }
}

module.exports = new BundleAnalyzer(); 