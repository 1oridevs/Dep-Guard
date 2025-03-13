class DependencyError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'DependencyError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, DependencyError);
  }

  static fromError(error, code = 'UNKNOWN_ERROR') {
    return new DependencyError(error.message, code, {
      originalError: error,
      stack: error.stack
    });
  }
}

class ValidationError extends DependencyError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

class NetworkError extends DependencyError {
  constructor(message, details = {}) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

class ConfigError extends DependencyError {
  constructor(message, details = {}) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

module.exports = {
  DependencyError,
  ValidationError,
  NetworkError,
  ConfigError
}; 