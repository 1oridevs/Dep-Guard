const ora = require('ora');
const chalk = require('chalk');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const securityChecker = require('../core/checkers/security-checker');
const policyChecker = require('../core/checkers/policy-checker');
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
        
        if (Object.keys(dependencies).length === 0) {
          spinner.info('No dependencies found');
          return;
        }

        // Run security audit
        spinner.text = 'Running security audit...';
        const securityResults = await securityChecker.runSecurityAudit(process.cwd());

        // Scan dependencies
        spinner.text = 'Analyzing dependencies...';
        const results = await dependencyScanner.scanDependencies(dependencies);

        // Format results
        const formattedResults = results.map(dep => ({
          name: dep.name,
          currentVersion: dep.version,
          latestVersion: dep.latestVersion,
          updateType: dep.updateType,
          securityIssues: securityResults.vulnerabilities.filter(v => v.package === dep.name).length,
          license: dep.license
        }));

        spinner.succeed('Scan complete! 🎉');

        // Output results based on format
        outputResults(options.format, formattedResults, securityResults.vulnerabilities);

      } catch (error) {
        spinner.fail(chalk.red(`Scan failed: ${error.message}`));
        logger.debug('Error details:', error);
        process.exit(1);
      }
    });
}

function outputResults(format, results, issues) {
  switch (format.toLowerCase()) {
    case 'json':
      console.log(JSON.stringify({ results, issues }, null, 2));
      break;

    case 'csv':
      console.log(convertToCSV(results));
      break;

    case 'html':
      console.log(convertToHTML(results));
      break;

    default: // table
      console.log('\nDependency Scan Results:');
      console.table(results);
      
      if (issues.length > 0) {
        console.log('\nIssues Found:');
        issues.forEach(issue => {
          const color = issue.severity === 'high' ? 'red' : 'yellow';
          console.log(chalk[color](`- [${issue.severity}] ${issue.title} in ${issue.package}`));
        });
      }
  }
}

module.exports = scanCommand; 