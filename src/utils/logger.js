const chalk = require('chalk');

class Logger {
  constructor() {
    this.debugMode = process.env.DEBUG === 'true';
    this.silent = process.env.SILENT === 'true';
  }

  debug(...args) {
    if (this.debugMode && !this.silent) {
      console.log(chalk.gray('🔍 DEBUG:'), ...args);
    }
  }

  info(...args) {
    if (!this.silent) {
      console.log(chalk.blue('ℹ️ INFO:'), ...args);
    }
  }

  success(...args) {
    if (!this.silent) {
      console.log(chalk.green('✅ SUCCESS:'), ...args);
    }
  }

  warn(...args) {
    if (!this.silent) {
      console.log(chalk.yellow('⚠️ WARNING:'), ...args);
    }
  }

  error(...args) {
    if (!this.silent) {
      console.error(chalk.red('❌ ERROR:'), ...args);
    }
  }

  setDebug(enabled) {
    this.debugMode = enabled;
  }

  setSilent(enabled) {
    this.silent = enabled;
  }
}

module.exports = new Logger(); 