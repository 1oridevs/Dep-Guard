const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

class FileUtils {
  async readJsonSafe(filePath, defaultValue = null) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.debug(`Failed to read JSON file ${filePath}:`, error);
      return defaultValue;
    }
  }

  async writeJsonSafe(filePath, data, options = {}) {
    try {
      const { pretty = true, backup = true } = options;
      const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

      if (backup) {
        await this.backupFile(filePath);
      }

      await fs.writeFile(filePath, content, 'utf8');
      return true;
    } catch (error) {
      logger.error(`Failed to write JSON file ${filePath}:`, error);
      return false;
    }
  }

  async backupFile(filePath) {
    try {
      const exists = await this.exists(filePath);
      if (!exists) return null;

      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      logger.error(`Failed to backup file ${filePath}:`, error);
      return null;
    }
  }

  async getFileHash(filePath, algorithm = 'sha256') {
    const content = await fs.readFile(filePath);
    return crypto.createHash(algorithm).update(content).digest('hex');
  }

  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new FileUtils(); 