const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class FileSystemUtils {
  async readJsonFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async writeJsonFile(filePath, data, pretty = true) {
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await fs.writeFile(filePath, content);
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async findFiles(pattern, rootDir = process.cwd()) {
    const glob = require('glob');
    return new Promise((resolve, reject) => {
      glob(pattern, { cwd: rootDir }, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  }

  async copyFile(src, dest) {
    await this.ensureDirectory(path.dirname(dest));
    await fs.copyFile(src, dest);
  }

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new FileSystemUtils(); 