const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const logger = require('./logger');
const { ValidationError } = require('./errors');

class FileHelper {
  async readFile(filePath, options = {}) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return this.parseFile(content, path.extname(filePath), options);
    } catch (error) {
      logger.error(`Failed to read file ${filePath}:`, error);
      throw new ValidationError(`Failed to read file: ${error.message}`);
    }
  }

  async writeFile(filePath, data, options = {}) {
    try {
      const content = this.stringifyFile(data, path.extname(filePath), options);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      logger.error(`Failed to write file ${filePath}:`, error);
      throw new ValidationError(`Failed to write file: ${error.message}`);
    }
  }

  parseFile(content, extension, options = {}) {
    try {
      switch (extension.toLowerCase()) {
        case '.json':
          return JSON.parse(content);
        case '.yaml':
        case '.yml':
          return yaml.load(content);
        default:
          return content;
      }
    } catch (error) {
      throw new ValidationError(`Failed to parse file: ${error.message}`);
    }
  }

  stringifyFile(data, extension, options = {}) {
    try {
      switch (extension.toLowerCase()) {
        case '.json':
          return JSON.stringify(data, null, 2);
        case '.yaml':
        case '.yml':
          return yaml.dump(data, {
            indent: 2,
            ...options
          });
        default:
          return String(data);
      }
    } catch (error) {
      throw new ValidationError(`Failed to stringify file: ${error.message}`);
    }
  }

  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async findFiles(directory, pattern) {
    const results = [];
    
    async function scan(dir) {
      const files = await fs.readdir(dir, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
          await scan(fullPath);
        } else if (pattern.test(file.name)) {
          results.push(fullPath);
        }
      }
    }

    await scan(directory);
    return results;
  }
}

module.exports = new FileHelper(); 