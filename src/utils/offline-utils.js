const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class OfflineUtils {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.dependency-guardian');
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 1 week
  }

  async ensureCacheDir() {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  async savePackageData(packageName, data) {
    await this.ensureCacheDir();
    const filePath = path.join(this.cacheDir, `${packageName}.json`);
    await fs.writeFile(filePath, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }

  async getPackageData(packageName) {
    try {
      const filePath = path.join(this.cacheDir, `${packageName}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      const { data, timestamp } = JSON.parse(content);
      
      if (Date.now() - timestamp > this.maxAge) {
        logger.warn(`Cached data for ${packageName} is older than ${this.maxAge}ms`);
      }
      
      return data;
    } catch (error) {
      return null;
    }
  }

  async clearCache() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await this.ensureCacheDir();
    } catch (error) {
      logger.error('Failed to clear offline cache:', error);
    }
  }
}

module.exports = new OfflineUtils(); 