const ciCommand = require('../../src/commands/ci');
const dependencyScanner = require('../../src/core/dependency-scanner');
const securityChecker = require('../../src/core/security-checker');
const fs = require('fs').promises;

jest.mock('../../src/core/dependency-scanner');
jest.mock('../../src/core/security-checker');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn()
  }
}));

describe('CI Command', () => {
  let program;
  let mockAction;
  let originalExit;

  beforeEach(() => {
    originalExit = process.exit;
    process.exit = jest.fn();

    mockAction = jest.fn();
    program = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      option: jest.fn().mockReturnThis(),
      action: jest.fn(cb => {
        mockAction.mockImplementation(cb);
      })
    };

    dependencyScanner.readPackageJson.mockResolvedValue({
      dependencies: {
        'test-pkg': '1.0.0'
      }
    });
  });

  afterEach(() => {
    process.exit = originalExit;
    jest.clearAllMocks();
  });

  it('should register command correctly', () => {
    ciCommand(program, {});
    expect(program.command).toHaveBeenCalledWith('ci');
    expect(program.description).toHaveBeenCalled();
    expect(program.option).toHaveBeenCalled();
  });

  describe('security checks', () => {
    it('should fail on high severity vulnerabilities', async () => {
      const config = {
        checks: { security: true },
        ci: { failOnIssues: true }
      };

      securityChecker.runSecurityAudit.mockResolvedValue({
        summary: {
          critical: 1,
          high: 2
        }
      });

      ciCommand(program, config);
      await mockAction({ report: 'junit' });

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(process.env.DEPGUARD_ISSUES).toBeDefined();
    });

    it('should pass with no vulnerabilities', async () => {
      const config = {
        checks: { security: true },
        ci: { failOnIssues: true }
      };

      securityChecker.runSecurityAudit.mockResolvedValue({
        summary: {
          critical: 0,
          high: 0
        }
      });

      dependencyScanner.scanDependencies.mockResolvedValue([]);

      ciCommand(program, config);
      await mockAction({ report: 'junit' });

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('report generation', () => {
    it('should generate JUnit report', async () => {
      ciCommand(program, {
        checks: { security: true },
        ci: { failOnIssues: false }
      });

      await mockAction({ report: 'junit' });

      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.writeFile.mock.calls[0][0]).toContain('dependency-report.xml');
    });

    it('should generate JSON report', async () => {
      ciCommand(program, {
        checks: { security: true },
        ci: { failOnIssues: false }
      });

      await mockAction({ report: 'json' });

      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.writeFile.mock.calls[0][1]).toContain('"type"');
    });
  });
}); 