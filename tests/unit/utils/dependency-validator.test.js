const dependencyValidator = require('../../../src/utils/dependency-validator');

describe('DependencyValidator', () => {
  beforeEach(() => {
    // Reset rules to default before each test
    dependencyValidator.setRules({
      maxDependencies: 150,
      maxDevDependencies: 50,
      allowedVersionPrefixes: ['^', '~', '>='],
      blockedPackages: [],
      requiredPeerDependencies: {}
    });
  });

  describe('validateDependencies', () => {
    it('should validate dependency count', async () => {
      const dependencies = {};
      for (let i = 0; i < 151; i++) {
        dependencies[`pkg-${i}`] = '^1.0.0';
      }

      const issues = await dependencyValidator.validateDependencies({ dependencies });
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('limit');
    });

    it('should detect blocked packages', async () => {
      dependencyValidator.setRules({
        blockedPackages: ['blocked-pkg']
      });

      const issues = await dependencyValidator.validateDependencies({
        dependencies: {
          'blocked-pkg': '^1.0.0'
        }
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('security');
    });

    it('should validate peer dependencies', async () => {
      dependencyValidator.setRules({
        requiredPeerDependencies: {
          'react': 'react-dom'
        }
      });

      const issues = await dependencyValidator.validateDependencies({
        dependencies: {
          'react': '^17.0.0'
        }
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('peer');
    });
  });

  describe('validateVersion', () => {
    it('should validate version format', () => {
      const issues = dependencyValidator.validateVersion('test-pkg', 'invalid');
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('version');
    });

    it('should check version prefix', () => {
      dependencyValidator.setRules({
        allowedVersionPrefixes: ['^']
      });

      const issues = dependencyValidator.validateVersion('test-pkg', '~1.0.0');
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('disallowed version prefix');
    });
  });
}); 