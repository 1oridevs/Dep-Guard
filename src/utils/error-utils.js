class DependencyGuardianError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'DependencyGuardianError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }

  static fromError(error, code) {
    if (error instanceof DependencyGuardianError) {
      return error;
    }
    return new DependencyGuardianError(error.message, code, {
      originalError: error
    });
  }
}

class NetworkError extends DependencyGuardianError {
  constructor(message, details = {}) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

class ValidationError extends DependencyGuardianError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

class TimeoutError extends DependencyGuardianError {
  constructor(message, details = {}) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

class RateLimitError extends DependencyGuardianError {
  constructor(message, details = {}) {
    super(message, 'RATE_LIMIT_ERROR', details);
    this.name = 'RateLimitError';
  }
}

class CacheError extends DependencyGuardianError {
  constructor(message, details = {}) {
    super(message, 'CACHE_ERROR', details);
    this.name = 'CacheError';
  }
}

module.exports = {
  DependencyGuardianError,
  NetworkError,
  ValidationError,
  TimeoutError,
  RateLimitError,
  CacheError
}; 