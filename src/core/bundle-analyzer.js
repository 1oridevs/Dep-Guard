const axios = require('axios');
const logger = require('../utils/logger');

class BundleAnalyzer {
  async analyzeBundleSize(packageName, version) {
    try {
      const response = await axios.get(`https://bundlephobia.com/api/size?package=${packageName}@${version}`);
      return {
        size: response.data.size,
        gzip: response.data.gzip,
        dependencyCount: response.data.dependencyCount
      };
    } catch (error) {
      logger.debug(`Bundle size analysis failed for ${packageName}:`, error);
      return null;
    }
  }
}

module.exports = new BundleAnalyzer(); 