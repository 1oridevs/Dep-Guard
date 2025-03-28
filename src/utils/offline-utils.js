const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class OfflineUtils {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || '.depguard/offline';
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize offline cache:', error);
      throw error;
    }
  }

  async savePackageData(packageName, data) {
    await this.init();

    const cachePath = this.getCachePath(packageName);
    const cacheData = {
      data,
      timestamp: Date.now()
    };

    try {
      await fs.writeFile(cachePath, JSON.stringify(cacheData), 'utf8');
      logger.debug(`Saved offline data for ${packageName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save offline data for ${packageName}:`, error);
      throw error;
    }
  }

  async getPackageData(packageName) {
    await this.init();

    const cachePath = this.getCachePath(packageName);

    try {
      const content = await fs.readFile(cachePath, 'utf8');
      const cacheData = JSON.parse(content);

      if (Date.now() - cacheData.timestamp > this.maxAge) {
        await this.deletePackageData(packageName);
        return null;
      }

      logger.debug(`Retrieved offline data for ${packageName}`);
      return cacheData.data;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Error reading offline data for ${packageName}:`, error);
      }
      return null;
    }
  }

  async deletePackageData(packageName) {
    const cachePath = this.getCachePath(packageName);

    try {
      await fs.unlink(cachePath);
      logger.debug(`Deleted offline data for ${packageName}`);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to delete offline data for ${packageName}:`, error);
      }
      return false;
    }
  }

  async clearCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
      logger.debug('Cleared offline cache');
      return true;
    } catch (error) {
      logger.error('Failed to clear offline cache:', error);
      return false;
    }
  }

  getCachePath(packageName) {
    return path.join(this.cacheDir, `${packageName.replace('/', '_')}.json`);
  }

  async cleanup() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const now = Date.now();

      await Promise.all(
        files.map(async file => {
          const filePath = path.join(this.cacheDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const cacheData = JSON.parse(content);
            
            if (now - cacheData.timestamp > this.maxAge) {
              await fs.unlink(filePath);
              logger.debug(`Cleaned up expired cache for ${file}`);
            }
          } catch (error) {
            // Delete corrupted cache files
            await fs.unlink(filePath);
            logger.debug(`Removed corrupted cache file: ${file}`);
          }
        })
      );
      return true;
    } catch (error) {
      logger.error('Failed to cleanup offline cache:', error);
      return false;
    }
  }
}

module.exports = new OfflineUtils(); 