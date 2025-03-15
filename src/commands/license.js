const ora = require('ora');
const chalk = require('chalk');
const licenseAnalyzer = require('../core/analyzers/license-analyzer');
const logger = require('../utils/logger');

function licenseCommand(program) {
  program
    .command('license')
    .description('Analyze license compatibility between dependencies')
    .option('-m, --matrix', 'Show full compatibility matrix')
    .option('-d, --details', 'Show detailed license information')
    .option('-f, --format <type>', 'Output format (text, json)', 'text')
    .action(async (options) => {
      const spinner = ora('Analyzing license compatibility...').start();

      try {
        const analysis = await licenseAnalyzer.analyze();
        spinner.succeed('License analysis complete');

        if (options.format === 'json') {
          console.log(JSON.stringify(analysis, null, 2));
          return;
        }

        // Display results
        console.log('\n' + chalk.bold(`Project License: ${analysis.projectLicense}`));

        if (analysis.issues.length > 0) {
          console.log('\n' + chalk.bold('License Issues:'));
          analysis.issues.forEach(issue => {
            const color = issue.level === 'error' ? 'red' : 'yellow';
            console.log(chalk[color](`  ${issue.level === 'error' ? '✖' : '⚠'} ${issue.message}`));
          });
        }

        if (options.details) {
          console.log('\n' + chalk.bold('Dependency Licenses:'));
          Object.values(analysis.dependencies).forEach(dep => {
            const color = dep.compatible ? 'green' : 'red';
            console.log(chalk[color](`  ${dep.name}@${dep.version}: ${dep.license}`));
          });
        }

        console.log('\n' + chalk.bold('Summary:'));
        console.log(`Total dependencies: ${analysis.summary.total}`);
        console.log(`  ${chalk.green('Compatible:')} ${analysis.summary.compatible}`);
        console.log(`  ${chalk.red('Incompatible:')} ${analysis.summary.incompatible}`);
        console.log(`  ${chalk.yellow('Unknown:')} ${analysis.summary.unknown}`);

        console.log('\n' + chalk.bold('License Categories:'));
        console.log(`  Permissive: ${analysis.summary.byCategory.permissive}`);
        console.log(`  Copyleft: ${analysis.summary.byCategory.copyleft}`);
        console.log(`  Proprietary: ${analysis.summary.byCategory.proprietary}`);
        console.log(`  Unknown: ${analysis.summary.byCategory.unknown}`);

        if (options.matrix) {
          console.log('\n' + chalk.bold('Compatibility Matrix:'));
          // TODO: Implement matrix visualization
        }

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('License analysis error:', error);
        process.exit(1);
      }
    });
}

module.exports = licenseCommand; 