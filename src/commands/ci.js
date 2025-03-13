const ora = require('ora');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const dependencyScanner = require('../core/dependency-scanner');
const securityChecker = require('../core/security-checker');
const { convertToJUnit } = require('../utils/formatters');

async function ciCommand(program, config) {
  program
    .command('ci')
    .description('Run in CI mode')
    .option('--report <format>', 'Report format (junit, json)', 'junit')
    .action(async (options) => {
      const spinner = ora('Running CI checks...').start();
      const issues = [];
      
      try {
        const projectPath = process.cwd();
        const packageJson = await dependencyScanner.readPackageJson(projectPath);
        const dependencies = packageJson.dependencies || {};

        // Run security audit
        if (config.checks.security) {
          const securityResults = await securityChecker.runSecurityAudit(projectPath);
          const highSeverityCount = securityResults.summary.critical + securityResults.summary.high;

          if (highSeverityCount > 0) {
            issues.push({
              type: 'security',
              level: 'high',
              message: `Found ${highSeverityCount} high/critical vulnerabilities`
            });
          }
        }

        // Check outdated dependencies
        const results = await dependencyScanner.scanDependencies(dependencies);
        const majorUpdates = results.filter(r => r.updateType === 'major');

        if (majorUpdates.length > 0) {
          issues.push({
            type: 'updates',
            level: 'warning',
            message: `Found ${majorUpdates.length} major version updates available`
          });
        }

        // Generate report
        const reportPath = path.join(projectPath, 'dependency-report.xml');
        await generateReport(options.report, issues, reportPath);

        if (issues.length > 0 && config.ci.failOnIssues) {
          spinner.fail(chalk.red('CI checks failed'));
          process.env.DEPGUARD_ISSUES = JSON.stringify(issues);
          process.exit(1);
        }

        spinner.succeed('All checks passed');
        process.exit(0);

      } catch (error) {
        spinner.fail(chalk.red(`CI check failed: ${error.message}`));
        process.exit(1);
      }
    });
}

async function generateReport(format, issues, outputPath) {
  let report;
  switch (format.toLowerCase()) {
    case 'junit':
      report = convertToJUnit(issues);
      break;
    case 'json':
      report = JSON.stringify(issues, null, 2);
      break;
    default:
      throw new Error(`Unsupported report format: ${format}`);
  }

  await fs.writeFile(outputPath, report);
}

module.exports = ciCommand; 