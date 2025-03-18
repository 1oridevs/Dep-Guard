const testCommand = require('../../../src/commands/test');
const testUtils = require('../../../src/utils/test-utils');
const logger = require('../../../src/utils/logger');
const { exec } = require('child_process');

// Mock dependencies
jest.mock('../../../src/utils/test-utils');
jest.mock('../../../src/utils/logger');
jest.mock('child_process');
jest.mock('ora', () => {
  return () => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis()
  });
});

describe('test command', () => {
  let program;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock program object
    program = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      option: jest.fn().mockReturnThis(),
      action: jest.fn().mockImplementation(fn => {
        program.actionCallback = fn;
        return program;
      })
    };

    // Setup default mock implementations
    testUtils.setupTestEnvironment.mockResolvedValue();
    testUtils.cleanup.mockResolvedValue();
    exec.mockImplementation((cmd, callback) => callback(null, { stdout: 'Test output' }));
  });

  it('should register the test command with correct options', () => {
    testCommand(program);

    expect(program.command).toHaveBeenCalledWith('test');
    expect(program.description).toHaveBeenCalled();
    expect(program.option).toHaveBeenCalledWith('-t, --type <type>', expect.any(String), 'all');
    expect(program.option).toHaveBeenCalledWith('-w, --watch', expect.any(String));
    expect(program.option).toHaveBeenCalledWith('-c, --coverage', expect.any(String));
  });

  it('should run tests with default options', async () => {
    testCommand(program);
    await program.actionCallback({});

    expect(testUtils.setupTestEnvironment).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(
      'npm test',
      expect.any(Function)
    );
  });

  it('should handle test failures gracefully', async () => {
    const testError = new Error('Test failed');
    exec.mockImplementation((cmd, callback) => callback(testError));

    testCommand(program);
    await program.actionCallback({});

    expect(logger.error).toHaveBeenCalledWith('Test error:', testError);
  });

  it('should add watch flag when specified', async () => {
    testCommand(program);
    await program.actionCallback({ watch: true });

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('--watch'),
      expect.any(Function)
    );
  });

  it('should add coverage flag when specified', async () => {
    testCommand(program);
    await program.actionCallback({ coverage: true });

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('--coverage'),
      expect.any(Function)
    );
  });
}); 