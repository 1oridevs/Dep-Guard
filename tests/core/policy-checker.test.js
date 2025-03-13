const policyChecker = require('../../src/core/policy-checker');
const fs = require('fs').promises;

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

describe('PolicyChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadPolicy', () => {
    it('should load and parse policy file', async () => {
      const mockPolicy = {
        dependencies: {
          allowedUpdateTypes: ['patch', 'minor']
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockPolicy));

      const policy = await policyChecker.loadPolicy('test-policy.json');
      expect(policy).toEqual(mockPolicy);
    });

    it('should return default policy when file cannot be loaded', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));

      const policy = await policyChecker.loadPolicy('test-policy.json');
      expect(policy).toEqual(policyChecker.getDefaultPolicy());
    });
  });

  describe('checkDependency', () => {
    const mockPolicy = {
      dependencies: {
        allowedUpdateTypes: ['patch'],
        blockedPackages: ['blocked-pkg']
      },
      security: {
        maxVulnerabilityLevel: 'moderate'
      },
      licenses: {
        allowed: ['MIT'],
        blocked: ['GPL'],
        unknown: 'warn'
      }
    };

    it('should detect blocked packages', async () => {
      const dependency = {
        name: 'blocked-pkg',
        version: '1.0.0'
      };

      const issues = await policyChecker.checkDependency(dependency, mockPolicy);
      expect(issues).toContainEqual(
        expect.objectContaining({
          type: 'policy',
          level: 'high'
        })
      );
    });

    it('should check update types', async () => {
      const dependency = {
        name: 'test-pkg',
        version: '1.0.0',
        updateType: 'major'
      };

      const issues = await policyChecker.checkDependency(dependency, mockPolicy);
      expect(issues).toContainEqual(
        expect.objectContaining({
          type: 'updates',
          level: 'warning'
        })
      );
    });

    it('should validate licenses', async () => {
      const dependency = {
        name: 'test-pkg',
        version: '1.0.0',
        license: 'GPL'
      };

      const issues = await policyChecker.checkDependency(dependency, mockPolicy);
      expect(issues).toContainEqual(
        expect.objectContaining({
          type: 'license',
          level: 'high'
        })
      );
    });
  });

  describe('validatePolicy', () => {
    it('should validate policy structure', async () => {
      const invalidPolicy = {
        dependencies: {
          allowedUpdateTypes: 'not-an-array'
        }
      };

      const { errors, warnings } = await policyChecker.validatePolicy(invalidPolicy);
      expect(errors).toContain('allowedUpdateTypes must be an array');
    });
  });
}); 