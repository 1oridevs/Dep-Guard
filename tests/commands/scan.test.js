const scanCommand = require('../../src/commands/scan');
const dependencyScanner = require('../../src/core/dependency-scanner');

jest.mock('../../src/core/dependency-scanner');

describe('Scan Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should scan dependencies successfully', async () => {
    const mockDependencies = {
      'test-pkg': '1.0.0'
    };

    dependencyScanner.readPackageJson.mockResolvedValue({
      dependencies: mockDependencies
    });

    dependencyScanner.scanDependencies.mockResolvedValue([
      {
        name: 'test-pkg',
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateType: 'minor'
      }
    ]);

    const program = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      option: jest.fn().mockReturnThis(),
      action: jest.fn()
    };

    scanCommand(program, {});

    expect(program.command).toHaveBeenCalledWith('scan');
    expect(program.description).toHaveBeenCalled();
    expect(program.option).toHaveBeenCalled();
  });
}); 