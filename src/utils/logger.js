const chalk = require('chalk');

class Logger {
  constructor() {
    this.debugEnabled = process.env.DEBUG === 'true';
  }

  info(message, ...args) {
    console.log(chalk.blue('ℹ'), message, ...args);
  }

  success(message, ...args) {
    console.log(chalk.green('✓'), message, ...args);
  }

  warn(message, ...args) {
    console.log(chalk.yellow('⚠'), message, ...args);
  }

  error(message, ...args) {
    console.error(chalk.red('✖'), message, ...args);
  }

  debug(message, ...args) {
    if (this.debugEnabled) {
      console.log(chalk.gray('🔍'), message, ...args);
    }
  }

  table(data, columns) {
    console.table(data, columns);
  }
}

module.exports = new Logger(); 
module.exports = new Logger(); 