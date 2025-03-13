const { cosmiconfig } = require('cosmiconfig');
const logger = require('./logger');

const CONFIG_MODULE_NAME = 'depguard';

function loadConfig() {
  try {
    const explorer = cosmiconfig(CONFIG_MODULE_NAME);
    const result = explorer.searchSync();
    
    if (!result) {
      logger.debug('No configuration file found, using defaults');
      return getDefaultConfig();
    }

    logger.debug(`Configuration loaded from ${result.filepath}`);
    return {
      ...getDefaultConfig(),
      ...result.config
    };
  } catch (error) {
    logger.error('Error loading configuration:', error);
    return getDefaultConfig();
  }
}

function getDefaultConfig() {
  return {
    allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
    maxVulnerability: 'moderate',
    updateLevel: 'minor',
    checks: {
      security: true,
      license: true,
      updates: true
    },
    ignorePackages: [],
    ci: {
      failOnIssues: true,
      reportFormat: 'junit',
      createIssues: true
    }
  };
}

module.exports = {
  loadConfig,
  getDefaultConfig
}; 