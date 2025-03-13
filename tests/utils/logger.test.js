const logger = require('../../src/utils/logger');

describe('Logger', () => {
  let consoleLog;
  let consoleError;

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation();
    consoleError = jest.spyOn(console, 'error').mockImplementation();
    logger.setSilent(false);
    logger.setDebug(false);
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  describe('debug', () => {
    it('should not log when debug mode is off', () => {
      logger.debug('test message');
      expect(consoleLog).not.toHaveBeenCalled();
    });

    it('should log when debug mode is on', () => {
      logger.setDebug(true);
      logger.debug('test message');
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG:'),
        'test message'
      );
    });

    it('should not log when silent mode is on', () => {
      logger.setDebug(true);
      logger.setSilent(true);
      logger.debug('test message');
      expect(consoleLog).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('test message');
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        'test message'
      );
    });

    it('should not log when silent mode is on', () => {
      logger.setSilent(true);
      logger.info('test message');
      expect(consoleLog).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('test error');
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        'test error'
      );
    });

    it('should not log when silent mode is on', () => {
      logger.setSilent(true);
      logger.error('test error');
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should log success messages', () => {
      logger.success('test success');
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('SUCCESS:'),
        'test success'
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('test warning');
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('WARNING:'),
        'test warning'
      );
    });
  });
}); 