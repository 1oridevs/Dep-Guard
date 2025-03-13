const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');

class PathManager {
  constructor() {
    this.rootDir = this.findRootDir();
    this.cacheDir = path.join(this.rootDir, '.dependency-guardian');
  }

  async findRootDir() {
    let currentDir = process.cwd();
    
    while (currentDir !== '/') {
      try {
        const packagePath = path.join(currentDir, 'package.json');
        await fs.access(packagePath);
        return currentDir;
      } catch {
        currentDir = path.dirname(currentDir);
      }
    }

    logger.warn('Could not find project root, using current directory');
    return process.cwd();
  }

  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create cache directory:', error);
    }
  }

  resolvePath(relativePath) {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.join(this.rootDir, relativePath);
  }

  getConfigPath(filename) {
    return path.join(this.rootDir, 'config', filename);
  }

  getPolicyPath(policyName = 'default') {
    return path.join(this.rootDir, 'policies', `${policyName}.policy.json`);
  }

  getCachePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  getReportPath(format = 'json') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.rootDir, 'reports', `report-${timestamp}.${format}`);
  }
}

module.exports = new PathManager(); 