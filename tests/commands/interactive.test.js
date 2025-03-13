const interactiveCommand = require('../../src/commands/interactive');
const inquirer = require('inquirer');
const dependencyScanner = require('../../src/core/dependency-scanner');
const securityChecker = require('../../src/core/security-checker');

jest.mock('inquirer');
jest.mock('../../src/core/dependency-scanner');
jest.mock('../../src/core/security-checker');

describe('Interactive Command', () => {
  let program;
  let mockAction;

  beforeEach(() => {
    mockAction = jest.fn();
    program = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
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
    jest.clearAllMocks();
  });

  it('should register command correctly', () => {
    interactiveCommand(program, {});
    expect(program.command).toHaveBeenCalledWith('interactive');
    expect(program.description).toHaveBeenCalled();
  });

  describe('dependency selection', () => {
    it('should list dependencies for selection', async () => {
      inquirer.prompt.mockResolvedValueOnce({
        dep: { name: 'test-pkg', version: '1.0.0' }
      }).mockResolvedValueOnce({
        action: 'update'
      });

      dependencyScanner.getLatestVersion.mockResolvedValue('2.0.0');

      interactiveCommand(program, {});
      await mockAction();

      expect(inquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'list',
            name: 'dep'
          })
        ])
      );
    });
  });

  describe('actions', () => {
    beforeEach(() => {
      inquirer.prompt.mockResolvedValueOnce({
        dep: { name: 'test-pkg', version: '1.0.0' }
      });
    });

    it('should handle update action', async () => {
      inquirer.prompt.mockResolvedValueOnce({
        action: 'update'
      });

      dependencyScanner.getLatestVersion.mockResolvedValue('2.0.0');

      interactiveCommand(program, {});
      await mockAction();

      expect(dependencyScanner.getLatestVersion).toHaveBeenCalledWith('test-pkg');
    });

    it('should handle security action', async () => {
      inquirer.prompt.mockResolvedValueOnce({
        action: 'security'
      });

      securityChecker.checkVulnerabilityDatabase.mockResolvedValue({
        vulnerabilities: []
      });

      interactiveCommand(program, {});
      await mockAction();

      expect(securityChecker.checkVulnerabilityDatabase).toHaveBeenCalledWith(
        'test-pkg',
        '1.0.0'
      );
    });
  });

  it('should handle errors gracefully', async () => {
    dependencyScanner.readPackageJson.mockRejectedValue(new Error('Test error'));

    interactiveCommand(program, {});
    await mockAction();

    expect(process.exitCode).toBe(1);
  });
}); 