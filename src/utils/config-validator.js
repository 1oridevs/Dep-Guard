const Joi = require('joi');
const logger = require('./logger');

const configSchema = Joi.object({
  registry: Joi.string().uri(),
  maxRetries: Joi.number().min(0).max(10),
  timeout: Joi.number().min(1000).max(60000),
  cacheTimeout: Joi.number().min(0),
  offline: Joi.boolean(),
  strict: Joi.boolean(),
  debug: Joi.boolean(),
  output: Joi.string(),
  format: Joi.string().valid('json', 'table', 'markdown'),
  cachePath: Joi.string(),
  maxCacheKeys: Joi.number().min(-1)
});

class ConfigValidator {
  validate(config) {
    const { error, value } = configSchema.validate(config, {
      abortEarly: false,
      allowUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => detail.message);
      logger.error('Invalid configuration:', details.join(', '));
      throw new ValidationError('Invalid configuration', { details });
    }

    return value;
  }
}

module.exports = new ConfigValidator(); 