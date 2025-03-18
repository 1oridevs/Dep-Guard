const ora = require('ora');
const chalk = require('chalk');
const testUtils = require('../utils/test-utils');
const logger = require('../utils/logger');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

function testCommand(program) {
  program
    .command('test')
    .description('Run automated tests')
    .option('-t, --type <type>', 'Test type (unit, integration, e2e, all)', 'all')
    .option('-w, --watch', 'Watch mode')
    .option('-c, --coverage', 'Generate coverage report')
    .option('--setup-only', 'Only setup test environment')
    .action(async (options) => {
      const spinner = ora('Setting up test environment...').start();

      try {
        // Setup test environment
        await testUtils.setupTestEnvironment(options);
        spinner.succeed('Test environment ready');

        if (options['setup-only']) {
          return;
        }

        // Determine test command based on type
        let cmd = 'npm run test';
        if (options.type !== 'all') {
          cmd = `npm run test:${options.type}`;
        }

        // Add flags
        if (options.watch) cmd += ' -- --watch';
        if (options.coverage) cmd += ' -- --coverage';

        spinner.start('Running tests...');
        await execPromise(cmd);
        spinner.succeed('Tests completed successfully');

      } catch (error) {
        spinner.fail(`Tests failed (${options.type}): ${error.message}`);
        logger.error('Test error:', error);
        process.exit(1);
      }
    });
}

module.exports = testCommand; 