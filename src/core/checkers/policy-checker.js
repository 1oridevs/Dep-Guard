const logger = require('../../utils/logger');
const config = require('../../utils/config');

class PolicyChecker {
  constructor() {
    this.config = config;
  }

  async loadPolicy() {
    try {
      await this.config.load();
      return this.config.get('policy');
    } catch (error) {
      logger.error('Failed to load policy:', error);
      throw error;
    }
  }

  validatePolicy(policy) {
    const errors = [];
    const warnings = [];

    // Validate required sections
    if (!policy.dependencies) errors.push('Missing dependencies section');
    if (!policy.security) errors.push('Missing security section');
    if (!policy.licenses) errors.push('Missing licenses section');

    // Validate dependencies section
    if (policy.dependencies) {
      if (typeof policy.dependencies.maxAge !== 'number') {
        errors.push('maxAge must be a number');
      }
      if (!Array.isArray(policy.dependencies.allowedUpdateTypes)) {
        errors.push('allowedUpdateTypes must be an array');
      }
      if (!Array.isArray(policy.dependencies.blockedPackages)) {
        errors.push('blockedPackages must be an array');
      }
    }

    return { errors, warnings };
  }
}

module.exports = new PolicyChecker(); 