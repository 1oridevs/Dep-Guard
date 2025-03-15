const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const logger = require('./logger');

class ConfigUtils {
  constructor() {
    this.configFiles = [
      '.dependency-guardian.json',
      '.dependency-guardian.yaml',
      '.dependency-guardian.yml',
      'package.json'
    ];
    this.configKey = 'dependencyGuardian';
  }

  async loadConfig(customPath = null) {
    try {
      if (customPath) {
        return await this.loadConfigFile(customPath);
      }

      // Try each config file in order
      for (const file of this.configFiles) {
        const config = await this.loadConfigFile(file);
        if (config) return config;
      }

      return null;
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      return null;
    }
  }

  async loadConfigFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        const json = JSON.parse(content);
        return filePath === 'package.json' ? json[this.configKey] : json;
      }
      
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        return yaml.load(content);
      }

      return null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveConfig(config, filePath = '.dependency-guardian.json') {
    try {
      const content = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
        ? yaml.dump(config)
        : JSON.stringify(config, null, 2);

      await fs.writeFile(filePath, content);
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      throw error;
    }
  }

  validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config) {
      errors.push('Configuration is empty');
      return { errors, warnings };
    }

    // Validate required sections
    ['security', 'license', 'updates'].forEach(section => {
      if (!config[section]) {
        warnings.push(`Missing "${section}" configuration section`);
      }
    });

    // Validate security settings
    if (config.security) {
      if (!['low', 'moderate', 'high', 'critical'].includes(config.security.level)) {
        errors.push('Invalid security level');
      }
    }

    // Validate license settings
    if (config.license && !Array.isArray(config.license.allowed)) {
      errors.push('License allowed list must be an array');
    }

    return { errors, warnings };
  }
}

module.exports = new ConfigUtils(); 