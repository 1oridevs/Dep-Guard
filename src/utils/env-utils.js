const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./logger');

class EnvUtils {
  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
    this.cache = new Map();
  }

  async load(options = {}) {
    const {
      path: customPath,
      override = false,
      required = []
    } = options;

    try {
      const envPath = customPath || this.envPath;
      const content = await fs.readFile(envPath, 'utf8');
      const parsed = dotenv.parse(content);

      if (override) {
        Object.assign(process.env, parsed);
      } else {
        // Only set if not already defined
        Object.entries(parsed).forEach(([key, value]) => {
          if (!process.env[key]) {
            process.env[key] = value;
          }
        });
      }

      // Check required variables
      const missing = required.filter(key => !process.env[key]);
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }

      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`No .env file found at ${this.envPath}`);
        return {};
      }
      throw error;
    }
  }

  async save(variables, options = {}) {
    const {
      path: customPath,
      append = false
    } = options;

    const envPath = customPath || this.envPath;
    const content = Object.entries(variables)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    if (append) {
      await fs.appendFile(envPath, `\n${content}`);
    } else {
      await fs.writeFile(envPath, content);
    }
  }

  get(key, defaultValue = null) {
    return process.env[key] || defaultValue;
  }

  set(key, value) {
    process.env[key] = value;
  }

  has(key) {
    return key in process.env;
  }

  remove(key) {
    delete process.env[key];
  }

  async loadMultiple(envFiles) {
    const results = {};
    for (const file of envFiles) {
      results[file] = await this.load({ path: file });
    }
    return results;
  }

  async backup(backupPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupPath, `.env.backup.${timestamp}`);
    await fs.copyFile(this.envPath, backupFile);
    return backupFile;
  }

  parseValue(value) {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (!isNaN(value)) return Number(value);
    return value;
  }

  getTyped(key, defaultValue = null) {
    const value = this.get(key);
    return value ? this.parseValue(value) : defaultValue;
  }

  getRequired(key) {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }
}

module.exports = new EnvUtils(); 