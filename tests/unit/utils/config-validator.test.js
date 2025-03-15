const configValidator = require('../../../src/utils/config-validator');
const { ValidationError } = require('../../../src/utils/error-utils');

describe('ConfigValidator', () => {
  it('should validate valid config', () => {
    const config = {
      registry: 'https://registry.npmjs.org',
      maxRetries: 3,
      timeout: 30000,
      offline: false
    };

    const validated = configValidator.validate(config);
    expect(validated).toEqual(config);
  });

  it('should reject invalid registry URL', () => {
    const config = {
      registry: 'not-a-url'
    };

    expect(() => configValidator.validate(config))
      .toThrow(ValidationError);
  });

  it('should reject invalid timeout values', () => {
    const config = {
      timeout: 500 // Less than minimum
    };

    expect(() => configValidator.validate(config))
      .toThrow(ValidationError);
  });
}); 