const ora = require('ora');
const chalk = require('chalk');
const testUtils = require('../utils/test-utils');
const logger = require('../utils/logger');

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

        if (options.setupOnly) {
          console.log(chalk.blue('\nTest environment is ready for manual testing'));
          return;
        }

        // Run tests
        spinner.start('Running tests...');
        const command = testUtils.getTestCommand(options.type);
        
        if (options.watch) {
          command += ' --watch';
        }
        
        if (options.coverage) {
          command += ' --coverage';
        }

        const success = await testUtils.runTests(options.type);

        if (success) {
          spinner.succeed(chalk.green('All tests passed'));
          
          if (options.coverage) {
            console.log('\nCoverage report generated in coverage/');
          }
        } else {
          spinner.fail(chalk.red('Tests failed'));
          process.exit(1);
        }

      } catch (error) {
        spinner.fail('Test execution failed');
        logger.error('Test error:', error);
        process.exit(1);
      } finally {
        // Cleanup unless in watch mode
        if (!options.watch) {
          await testUtils.cleanup();
        }
      }
    });
}

module.exports = testCommand; 