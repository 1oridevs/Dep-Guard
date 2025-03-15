const chalk = require('chalk');

class Logger {
  constructor() {
    this.debugMode = false;
  }

  setDebug(enabled) {
    this.debugMode = enabled;
  }

  info(message, ...args) {
    console.log(chalk.blue('ℹ'), message, ...args);
  }

  error(message, ...args) {
    console.error(chalk.red('✖'), message, ...args);
  }

  warn(message, ...args) {
    console.warn(chalk.yellow('⚠'), message, ...args);
  }

  debug(message, ...args) {
    if (this.debugMode) {
      console.log(chalk.gray('🔍'), message, ...args);
    }
  }

  success(message, ...args) {
    console.log(chalk.green('✓'), message, ...args);
  }

  table(data, columns) {
    if (!this.silent) {
      console.table(data, columns);
    }
  }
}

module.exports = new Logger(); 