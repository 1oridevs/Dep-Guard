const ora = require('ora');
const chalk = require('chalk');
const cleanupAnalyzer = require('../core/analyzers/cleanup-analyzer');
const logger = require('../utils/logger');

function cleanupCommand(program) {
  program
    .command('cleanup')
    .description('Analyze and suggest dependency cleanup opportunities')
    .option('-f, --fix', 'Automatically fix simple issues')
    .option('--deep', 'Perform deep analysis')
    .action(async (options) => {
      const spinner = ora('Analyzing dependencies for cleanup opportunities...').start();

      try {
        const suggestions = await cleanupAnalyzer.analyze(process.cwd());
        spinner.succeed('Analysis complete');

        // Display results
        if (suggestions.summary.total === 0) {
          logger.success('No cleanup suggestions found. Your dependencies look good!');
          return;
        }

        console.log('\n' + chalk.bold('Cleanup Suggestions:'));

        if (suggestions.errors.length > 0) {
          console.log('\n' + chalk.red('Critical Issues:'));
          suggestions.errors.forEach(suggestion => {
            console.log(chalk.red(`  ✖ ${suggestion.message}`));
            console.log(chalk.gray(`    ${suggestion.action}`));
          });
        }

        if (suggestions.warnings.length > 0) {
          console.log('\n' + chalk.yellow('Warnings:'));
          suggestions.warnings.forEach(suggestion => {
            console.log(chalk.yellow(`  ⚠ ${suggestion.message}`));
            console.log(chalk.gray(`    ${suggestion.action}`));
          });
        }

        if (suggestions.info.length > 0) {
          console.log('\n' + chalk.blue('Suggestions:'));
          suggestions.info.forEach(suggestion => {
            console.log(chalk.blue(`  ℹ ${suggestion.message}`));
            console.log(chalk.gray(`    ${suggestion.action}`));
          });
        }

        console.log('\n' + chalk.bold('Summary:'));
        console.log(`Total suggestions: ${suggestions.summary.total}`);
        console.log(`  ${chalk.red('Critical:')} ${suggestions.summary.errors}`);
        console.log(`  ${chalk.yellow('Warnings:')} ${suggestions.summary.warnings}`);
        console.log(`  ${chalk.blue('Info:')} ${suggestions.summary.info}`);

        if (options.fix) {
          // Implement automatic fixing logic here
          spinner.start('Applying automatic fixes...');
          // TODO: Implement fixes
          spinner.succeed('Fixes applied');
        }

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('Cleanup analysis error:', error);
        process.exit(1);
      }
    });
}

module.exports = cleanupCommand; 