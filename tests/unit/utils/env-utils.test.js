const fs = require('fs').promises;
const path = require('path');
const envUtils = require('../../../src/utils/env-utils');

describe('EnvUtils', () => {
  const testDir = path.join(__dirname, '../../fixtures/env-test');
  const testEnvPath = path.join(testDir, 'test.env');
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset process.env
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    try {
      await fs.unlink(testEnvPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });

  describe('load', () => {
    it('should load environment variables from file', async () => {
      await fs.writeFile(testEnvPath, 'TEST_KEY=test_value\nANOTHER_KEY=123');
      
      const result = await envUtils.load({ path: testEnvPath, override: true });
      
      expect(result).toEqual({
        TEST_KEY: 'test_value',
        ANOTHER_KEY: '123'
      });
      expect(process.env.TEST_KEY).toBe('test_value');
    });

    it('should not override existing env variables by default', async () => {
      process.env.EXISTING_KEY = 'original';
      await fs.writeFile(testEnvPath, 'EXISTING_KEY=new');
      
      await envUtils.load({ path: testEnvPath });
      
      expect(process.env.EXISTING_KEY).toBe('original');
    });

    it('should throw error for missing required variables', async () => {
      await fs.writeFile(testEnvPath, 'PRESENT_KEY=value');
      
      await expect(
        envUtils.load({
          path: testEnvPath,
          required: ['PRESENT_KEY', 'MISSING_KEY']
        })
      ).rejects.toThrow('Missing required environment variables: MISSING_KEY');
    });
  });

  describe('save', () => {
    it('should save variables to file', async () => {
      const vars = {
        KEY1: 'value1',
        KEY2: 'value2'
      };

      await envUtils.save(vars, { path: testEnvPath });
      
      const content = await fs.readFile(testEnvPath, 'utf8');
      expect(content).toBe('KEY1=value1\nKEY2=value2');
    });

    it('should append variables when append option is true', async () => {
      await fs.writeFile(testEnvPath, 'EXISTING=value');
      
      await envUtils.save({ NEW: 'new_value' }, {
        path: testEnvPath,
        append: true
      });
      
      const content = await fs.readFile(testEnvPath, 'utf8');
      expect(content).toBe('EXISTING=value\nNEW=new_value');
    });
  });

  describe('get/set/has/remove', () => {
    it('should manage environment variables', () => {
      envUtils.set('TEST_VAR', 'test');
      expect(envUtils.get('TEST_VAR')).toBe('test');
      expect(envUtils.has('TEST_VAR')).toBe(true);
      
      envUtils.remove('TEST_VAR');
      expect(envUtils.has('TEST_VAR')).toBe(false);
      expect(envUtils.get('TEST_VAR', 'default')).toBe('default');
    });
  });

  describe('loadMultiple', () => {
    it('should load multiple env files', async () => {
      const env1 = path.join(testDir, '.env.dev');
      const env2 = path.join(testDir, '.env.prod');

      await fs.writeFile(env1, 'DEV_KEY=dev_value');
      await fs.writeFile(env2, 'PROD_KEY=prod_value');

      const results = await envUtils.loadMultiple([env1, env2]);
      expect(results[env1]).toHaveProperty('DEV_KEY', 'dev_value');
      expect(results[env2]).toHaveProperty('PROD_KEY', 'prod_value');
    });
  });

  describe('parseValue', () => {
    it('should parse different value types', () => {
      expect(envUtils.parseValue('true')).toBe(true);
      expect(envUtils.parseValue('false')).toBe(false);
      expect(envUtils.parseValue('123')).toBe(123);
      expect(envUtils.parseValue('test')).toBe('test');
    });
  });

  describe('getRequired', () => {
    it('should throw error for missing required variables', () => {
      expect(() => envUtils.getRequired('MISSING_KEY')).toThrow();
    });

    it('should return value for existing variables', () => {
      process.env.TEST_KEY = 'test';
      expect(envUtils.getRequired('TEST_KEY')).toBe('test');
    });
  });
}); 