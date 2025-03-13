const chalk = require('chalk');

const DEBUG = process.env.DEBUG || false;
const verboseMode = process.env.VERBOSE || false;

class Logger {
  constructor() {
    this.debugMode = DEBUG;
    this.verboseMode = verboseMode;
  }

  debug(...args) {
    if (this.debugMode) {
      console.log(chalk.gray('[DEBUG]'), ...args);
    }
  }

  info(message) {
    console.log(chalk.blue(message));
  }

  warn(message) {
    console.log(chalk.yellow(message));
  }

  error(message, error = null) {
    console.error(chalk.red(message));
    if (error && this.debugMode) {
      console.error(error);
    }
  }

  success(message) {
    console.log(chalk.green(message));
  }

  verbose(message) {
    if (this.verboseMode) {
      console.log(chalk.gray(message));
    }
  }
}

module.exports = new Logger(); 