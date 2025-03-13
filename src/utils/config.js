const { cosmiconfig } = require('cosmiconfig');
const path = require('path');
const logger = require('./logger');
const defaultConfig = require('../config/default');
const { ConfigError } = require('./errors');

class ConfigManager {
  constructor() {
    this.config = null;
  }

  async load() {
    if (this.config) {
      return this.config;
    }

    try {
      const explorer = cosmiconfig('dependency-guardian');
      const result = await explorer.search();

      this.config = result ? this.mergeConfig(defaultConfig, result.config) : defaultConfig;
      
      const validation = this.validateConfig(this.config);
      if (validation.errors.length > 0) {
        throw new ConfigError('Invalid configuration: ' + validation.errors.join(', '));
      }

      return this.config;
    } catch (error) {
      logger.debug('Failed to load config:', error);
      this.config = defaultConfig;
      return this.config;
    }
  }

  mergeConfig(base, override) {
    const merged = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeConfig(base[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Validate policy section
    if (!config.policy) {
      errors.push('Missing policy section');
    } else {
      // Validate dependencies section
      if (!config.policy.dependencies) {
        errors.push('Missing dependencies section in policy');
      } else {
        if (typeof config.policy.dependencies.maxAge !== 'number') {
          errors.push('policy.dependencies.maxAge must be a number');
        }
        if (!Array.isArray(config.policy.dependencies.allowedUpdateTypes)) {
          errors.push('policy.dependencies.allowedUpdateTypes must be an array');
        }
        if (!Array.isArray(config.policy.dependencies.blockedPackages)) {
          errors.push('policy.dependencies.blockedPackages must be an array');
        }
      }

      // Validate security section
      if (!config.policy.security) {
        errors.push('Missing security section in policy');
      }

      // Validate licenses section
      if (!config.policy.licenses) {
        errors.push('Missing licenses section in policy');
      } else {
        if (!Array.isArray(config.policy.licenses.allowed)) {
          errors.push('policy.licenses.allowed must be an array');
        }
        if (!Array.isArray(config.policy.licenses.blocked)) {
          errors.push('policy.licenses.blocked must be an array');
        }
      }
    }

    return { errors, warnings };
  }

  get(key, defaultValue = null) {
    if (!this.config) {
      throw new ConfigError('Config not loaded. Call load() first.');
    }

    return key.split('.').reduce((obj, part) => obj && obj[part], this.config) ?? defaultValue;
  }
}

module.exports = new ConfigManager(); 