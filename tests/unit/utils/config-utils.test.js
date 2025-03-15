const configUtils = require('../../../src/utils/config-utils');
const fs = require('fs').promises;
const path = require('path');

describe('ConfigUtils', () => {
  const testDir = path.join(__dirname, 'test-config');
  const jsonConfig = path.join(testDir, '.dependency-guardian.json');
  const yamlConfig = path.join(testDir, '.dependency-guardian.yaml');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(jsonConfig);
      await fs.unlink(yamlConfig);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });

  describe('loadConfig', () => {
    it('should load JSON configuration', async () => {
      const config = {
        security: { level: 'high' },
        license: { allowed: ['MIT'] }
      };

      await fs.writeFile(jsonConfig, JSON.stringify(config));
      
      const loaded = await configUtils.loadConfig(jsonConfig);
      expect(loaded).toEqual(config);
    });

    it('should load YAML configuration', async () => {
      const yaml = `
security:
  level: high
license:
  allowed:
    - MIT
`;
      await fs.writeFile(yamlConfig, yaml);
      
      const loaded = await configUtils.loadConfig(yamlConfig);
      expect(loaded).toEqual({
        security: { level: 'high' },
        license: { allowed: ['MIT'] }
      });
    });
  });

  describe('validateConfig', () => {
    it('should validate configuration structure', () => {
      const config = {
        security: { level: 'invalid' },
        license: { allowed: 'not-an-array' }
      };

      const { errors, warnings } = configUtils.validateConfig(config);
      expect(errors).toContain('Invalid security level');
      expect(errors).toContain('License allowed list must be an array');
    });

    it('should warn about missing sections', () => {
      const config = {
        security: { level: 'high' }
      };

      const { warnings } = configUtils.validateConfig(config);
      expect(warnings).toContain('Missing "license" configuration section');
      expect(warnings).toContain('Missing "updates" configuration section');
    });
  });
}); 