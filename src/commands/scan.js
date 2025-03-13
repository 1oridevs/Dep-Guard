const ora = require('ora');
const chalk = require('chalk');
const dependencyScanner = require('../core/dependency-scanner');
const policyChecker = require('../core/policy-checker');
const logger = require('../utils/logger');
const { convertToCSV, convertToHTML } = require('../utils/formatters');

async function scanCommand(program, config) {
  program
    .command('scan')
    .description('Scan project dependencies for issues')
    .option('-f, --format <type>', 'Output format (table, json, csv, html)', 'table')
    .option('-p, --policy <path>', 'Path to custom policy file')
    .action(async (options) => {
      const spinner = ora('Scanning dependencies...').start();
      
      try {
        // Load policy
        const policy = await policyChecker.loadPolicy(options.policy);
        
        // Read package.json
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = packageJson.dependencies || {};
        
        // Scan dependencies
        const results = await dependencyScanner.scanDependencies(dependencies);
        
        // Check each dependency against policy
        const issues = [];
        for (const dep of results) {
          const policyIssues = await policyChecker.checkDependency(dep, policy);
          if (policyIssues.length > 0) {
            issues.push(...policyIssues);
          }
        }

        spinner.stop();

        // Format and display results
        outputResults(results, issues, options.format);

        // Exit with error if critical issues found
        if (issues.some(i => i.level === 'high')) {
          process.exit(1);
        }

      } catch (error) {
        spinner.fail(chalk.red(`Scan failed: ${error.message}`));
        logger.debug('Error details:', error);
        process.exit(1);
      }
    });
}

function outputResults(results, issues, format) {
  const formattedResults = results.map(dep => ({
    name: dep.name,
    currentVersion: dep.version,
    latestVersion: dep.latestVersion || 'unknown',
    updateType: dep.updateType || 'unknown',
    status: issues.some(i => i.level === 'high' && i.name === dep.name) ? 'blocked' : 'ok'
  }));

  switch (format.toLowerCase()) {
    case 'json':
      console.log(JSON.stringify({ results: formattedResults, issues }, null, 2));
      break;

    case 'csv':
      console.log(convertToCSV(formattedResults));
      break;

    case 'html':
      console.log(convertToHTML(formattedResults));
      break;

    default: // table
      console.log('\nDependency Scan Results:');
      console.table(formattedResults);
      
      if (issues.length > 0) {
        console.log('\nIssues Found:');
        issues.forEach(issue => {
          const color = issue.level === 'high' ? 'red' : 'yellow';
          console.log(chalk[color](`- [${issue.type}] ${issue.message}`));
        });
      }
  }
}

module.exports = scanCommand; 