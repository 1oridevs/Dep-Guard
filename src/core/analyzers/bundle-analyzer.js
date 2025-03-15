const axios = require('axios');
const path = require('path');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

class BundleAnalyzer {
  constructor() {
    this.cache = cache;
  }

  async analyzeBundleSize(dependencies) {
    const results = {
      totalSize: 0,
      gzipSize: 0,
      largest: []
    };

    try {
      // Analyze each dependency
      const promises = Object.entries(dependencies).map(async ([name, version]) => {
        const size = await this.getPackageSize(name, version);
        if (size) {
          results.totalSize += size.size;
          results.gzipSize += size.gzip;
          results.largest.push({
            name,
            size: size.size,
            gzip: size.gzip
          });
        }
      });

      await Promise.all(promises);

      // Sort largest dependencies
      results.largest.sort((a, b) => b.size - a.size);
      results.largest = results.largest.slice(0, 10);

      return results;
    } catch (error) {
      logger.error('Bundle analysis failed:', error);
      return results;
    }
  }

  async getPackageSize(name, version) {
    const cacheKey = `bundle-size-${name}@${version}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://bundlephobia.com/api/size?package=${name}@${version}`);
      const data = {
        size: response.data.size,
        gzip: response.data.gzip
      };

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      logger.debug(`Failed to get bundle size for ${name}@${version}:`, error);
      return null;
    }
  }

  async generateSizeReport(bundleStats) {
    return {
      summary: {
        total: bundleStats.totalSize,
        gzip: bundleStats.gzipSize,
        largestCount: bundleStats.largest.length
      },
      details: bundleStats.largest.map(dep => ({
        name: dep.name,
        size: this.formatSize(dep.size),
        gzip: this.formatSize(dep.gzip),
        percentage: ((dep.size / bundleStats.totalSize) * 100).toFixed(1)
      }))
    };
  }

  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

module.exports = new BundleAnalyzer(); 