const {
  DependencyGuardianError,
  NetworkError,
  ValidationError,
  TimeoutError,
  RateLimitError,
  CacheError
} = require('../../../src/utils/error-utils');

describe('Error Utils', () => {
  describe('DependencyGuardianError', () => {
    it('should create base error with details', () => {
      const error = new DependencyGuardianError('Test error', 'TEST_ERROR', { foo: 'bar' });
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ foo: 'bar' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should convert regular error', () => {
      const originalError = new Error('Original error');
      const error = DependencyGuardianError.fromError(originalError, 'CONVERTED');
      expect(error.message).toBe('Original error');
      expect(error.code).toBe('CONVERTED');
      expect(error.details.originalError).toBe(originalError);
    });
  });

  describe('Specific Error Types', () => {
    it('should create NetworkError', () => {
      const error = new NetworkError('Network failed', { url: 'test.com' });
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.details).toEqual({ url: 'test.com' });
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Invalid input', { field: 'name' });
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ field: 'name' });
    });

    it('should create TimeoutError', () => {
      const error = new TimeoutError('Operation timed out', { duration: 5000 });
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.details).toEqual({ duration: 5000 });
    });

    it('should create RateLimitError', () => {
      const error = new RateLimitError('Too many requests', { limit: 100 });
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.details).toEqual({ limit: 100 });
    });

    it('should create CacheError', () => {
      const error = new CacheError('Cache operation failed', { key: 'test' });
      expect(error.code).toBe('CACHE_ERROR');
      expect(error.details).toEqual({ key: 'test' });
    });
  });
}); 