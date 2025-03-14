const logger = require('../../../src/utils/logger');

describe('Logger', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('should log info messages', () => {
    logger.info('test message');
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][1]).toBe('test message');
  });

  test('should log error messages', () => {
    logger.error('test error');
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][1]).toBe('test error');
  });

  test('should respect silent mode', () => {
    logger.setSilent(true);
    logger.info('test message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
    logger.setSilent(false);
  });

  test('should only log debug in debug mode', () => {
    logger.setDebug(false);
    logger.debug('test debug');
    expect(consoleLogSpy).not.toHaveBeenCalled();

    logger.setDebug(true);
    logger.debug('test debug');
    expect(consoleLogSpy).toHaveBeenCalled();
  });
}); 