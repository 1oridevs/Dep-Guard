const logger = require('./logger');

class EnvironmentManager {
  constructor() {
    this.envCache = new Map();
    this.loadEnvironment();
  }

  loadEnvironment() {
    // Load from .env file if present
    require('dotenv').config();

    // Cache common environment variables
    this.cacheValue('NODE_ENV', process.env.NODE_ENV || 'development');
    this.cacheValue('DEBUG', process.env.DEBUG === 'true');
    this.cacheValue('CI', process.env.CI === 'true');
  }

  get(key, defaultValue = null) {
    if (this.envCache.has(key)) {
      return this.envCache.get(key);
    }

    const value = process.env[key] || defaultValue;
    this.cacheValue(key, value);
    return value;
  }

  cacheValue(key, value) {
    this.envCache.set(key, value);
  }

  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }

  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  isDebug() {
    return this.get('DEBUG', false);
  }

  isCI() {
    return this.get('CI', false);
  }

  getCredentials(service) {
    switch (service) {
      case 'github':
        return {
          token: this.get('GITHUB_TOKEN'),
          username: this.get('GITHUB_USERNAME')
        };
      case 'npm':
        return {
          token: this.get('NPM_TOKEN'),
          registry: this.get('NPM_REGISTRY', 'https://registry.npmjs.org')
        };
      case 'slack':
        return {
          webhook: this.get('SLACK_WEBHOOK_URL'),
          channel: this.get('SLACK_CHANNEL')
        };
      default:
        logger.warn(`Unknown service: ${service}`);
        return null;
    }
  }
}

module.exports = new EnvironmentManager(); 