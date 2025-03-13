const ora = require('ora');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const securityChecker = require('../core/checkers/security-checker');
const policyChecker = require('../core/checkers/policy-checker');
const logger = require('../utils/logger');
const { convertToJUnit } = require('../utils/formatters');

async function ciCommand(program, config) {
  program
    .command('ci')
    .description('Run dependency checks in CI environment')
    .option('-p, --policy <path>', 'Path to custom policy file')
    .option('--fail-on <level>', 'Exit with error on issue level (low, moderate, high)', 'high')
    .option('--junit <path>', 'Generate JUnit report')
    .option('--strict', 'Enable strict mode (fail on any issue)')
    .action(async (options) => {
      const spinner = ora('Running CI checks...').start();
      
      try {
        // Load policy
        const policy = await policyChecker.loadPolicy(options.policy);
        
        // Read package.json
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = packageJson.dependencies || {};

        // Run security audit
        spinner.text = 'Running security audit...';
        const securityResults = await securityChecker.runSecurityAudit(process.cwd());

        // Scan dependencies
        spinner.text = 'Analyzing dependencies...';
        const scanResults = await dependencyScanner.scanDependencies(dependencies);

        // Validate against policy
        spinner.text = 'Validating against policy...';
        const policyValidation = await policyChecker.validatePolicy(policy);

        // Aggregate all issues
        const issues = [];

        // Add security issues
        securityResults.vulnerabilities.forEach(vuln => {
          issues.push({
            type: 'security',
            level: vuln.severity,
            package: vuln.package,
            message: vuln.title
          });
        });

        // Add policy violations
        if (policyValidation.errors.length > 0) {
          issues.push(...policyValidation.errors.map(error => ({
            type: 'policy',
            level: 'high',
            message: error
          })));
        }

        // Generate report
        if (options.junit) {
          const junitReport = convertToJUnit(scanResults);
          await fs.writeFile(options.junit, junitReport);
          spinner.info(`JUnit report saved to ${options.junit}`);
        }

        // Determine exit status
        const failLevel = options.failOn.toLowerCase();
        const shouldFail = options.strict 
          ? issues.length > 0
          : issues.some(issue => {
              const severity = issue.level.toLowerCase();
              return severity === failLevel || 
                (failLevel === 'moderate' && severity === 'high') ||
                (failLevel === 'low' && (severity === 'moderate' || severity === 'high'));
            });

        if (shouldFail) {
          spinner.fail(chalk.red('CI checks failed!'));
          issues.forEach(issue => {
            const color = issue.level === 'high' ? 'red' : 'yellow';
            console.log(chalk[color](`- [${issue.type}] ${issue.message}`));
          });
          process.exit(1);
        } else {
          spinner.succeed(chalk.green('CI checks passed!'));
        }

      } catch (error) {
        spinner.fail(chalk.red(`CI checks failed: ${error.message}`));
        logger.debug('Error details:', error);
        process.exit(1);
      }
    });
}

module.exports = ciCommand; 