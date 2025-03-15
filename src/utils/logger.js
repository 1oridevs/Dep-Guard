const chalk = require('chalk');

class Logger {
  constructor() {
    this.silent = false;
    this.debugMode = false;
  }

  setSilent(value) {
    this.silent = value;
  }

  setDebug(value) {
    this.debugMode = value;
  }

  log(level, message, ...args) {
    if (this.silent) return;

    if (level === 'debug' && !this.debugMode) return;

    const timestamp = new Date().toISOString();
    const prefix = this.getPrefix(level);
    
    console.log(`${prefix} ${message}`, ...args);
  }

  getPrefix(level) {
    switch (level) {
      case 'error':
        return chalk.red('✖');
      case 'warn':
        return chalk.yellow('⚠');
      case 'info':
        return chalk.blue('ℹ');
      case 'success':
        return chalk.green('✓');
      case 'debug':
        return chalk.gray('🔍');
      default:
        return '';
    }
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  success(message, ...args) {
    this.log('success', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  table(data, columns) {
    if (!this.silent) {
      console.table(data, columns);
    }
  }
}

module.exports = new Logger(); 