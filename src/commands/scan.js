const ora = require('ora');
const chalk = require('chalk');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const securityChecker = require('../core/checkers/security-checker');
const logger = require('../utils/logger');
const { convertToCSV, convertToHTML } = require('../utils/formatters');

function scanCommand(program) {
  program
    .command('scan')
    .description('Scan project dependencies for issues')
    .option('-s, --security', 'Include security scan')
    .option('-l, --licenses', 'Include license scan')
    .option('-f, --format <type>', 'Output format (json, csv, html)', 'text')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      const spinner = ora('Scanning dependencies...').start();

      try {
        // Scan dependencies first
        const dependencies = await dependencyScanner.scanDependencies();
        
        if (Object.keys(dependencies).length === 0) {
          spinner.info('No dependencies found');
          return;
        }

        let issues = [];

        // Run security checks if requested
        if (options.security) {
          spinner.text = 'Running security checks...';
          const securityIssues = await securityChecker.checkVulnerabilities(dependencies);
          issues = issues.concat(securityIssues);
        }

        spinner.succeed('Scan completed');

        // Display results
        logger.info('\nDependencies scanned:', Object.keys(dependencies).length);
        
        if (issues.length > 0) {
          logger.info('\nIssues Found:');
          issues.forEach(issue => {
            const color = issue.severity === 'high' ? 'red' : 'yellow';
            console.log(chalk[color](`- [${issue.severity}] ${issue.title} in ${issue.package}`));
          });
        } else {
          logger.success('No issues found');
        }

      } catch (error) {
        spinner.fail('Scan failed');
        logger.error('Scan error:', error);
        process.exit(1);
      }
    });
}

module.exports = scanCommand; 