const ora = require('ora');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const dependencyScanner = require('../core/dependency-scanner');
const policyChecker = require('../core/policy-checker');
const licenseChecker = require('../core/license-checker');
const logger = require('../utils/logger');
const { convertToJUnit } = require('../utils/formatters');

async function ciCommand(program, config) {
  program
    .command('ci')
    .description('Run dependency checks in CI environment')
    .option('-p, --policy <path>', 'Path to custom policy file')
    .option('-r, --report <type>', 'Report format (junit, json)', 'junit')
    .option('--report-path <path>', 'Path to save the report')
    .option('--fail-on <level>', 'Fail on issue level (low, medium, high)', 'high')
    .action(async (options) => {
      const spinner = ora('Running CI checks...').start();
      
      try {
        // Load policy
        const policy = await policyChecker.loadPolicy(options.policy);
        
        // Validate policy first
        const policyValidation = await policyChecker.validatePolicy(policy);
        if (policyValidation.errors.length > 0) {
          throw new Error(`Invalid policy configuration:\n${policyValidation.errors.join('\n')}`);
        }

        // Read package.json
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = packageJson.dependencies || {};

        // Collect all issues
        const issues = [];
        const results = [];

        // Scan each dependency
        for (const [name, version] of Object.entries(dependencies)) {
          const dep = {
            name,
            version,
            issues: []
          };

          // Check updates
          const latestVersion = await dependencyScanner.getLatestVersion(name);
          dep.latestVersion = latestVersion;
          dep.updateType = dependencyScanner.determineUpdateType(version, latestVersion);

          // Check license
          const licenseInfo = await licenseChecker.checkLicense(name, version);
          dep.license = licenseInfo?.name;

          // Check against policy
          const policyIssues = await policyChecker.checkDependency({
            name,
            version,
            license: dep.license,
            updateType: dep.updateType
          }, policy);

          if (policyIssues.length > 0) {
            dep.issues.push(...policyIssues);
            issues.push(...policyIssues);
          }

          results.push(dep);
        }

        spinner.stop();

        // Generate report
        const reportPath = options.reportPath || getDefaultReportPath(options.report);
        await generateReport(reportPath, results, issues, options.report);
        logger.info(`Report generated: ${reportPath}`);

        // Check if we should fail the build
        const shouldFail = shouldFailBuild(issues, options.failOn);
        if (shouldFail) {
          const criticalIssues = issues.filter(i => i.level === 'high').length;
          const message = `Found ${criticalIssues} critical issue(s)`;
          logger.error(message);
          
          // Set environment variable for CI systems
          process.env.DEPGUARD_ISSUES = 'true';
          process.env.DEPGUARD_CRITICAL_ISSUES = criticalIssues.toString();
          
          process.exit(1);
        }

        logger.success('CI checks passed successfully');

      } catch (error) {
        spinner.fail(chalk.red(`CI checks failed: ${error.message}`));
        logger.debug('Error details:', error);
        process.exit(1);
      }
    });
}

function getDefaultReportPath(format) {
  const filename = format === 'junit' ? 'dependency-report.xml' : 'dependency-report.json';
  return path.join(process.cwd(), 'reports', filename);
}

async function generateReport(reportPath, results, issues, format) {
  // Create reports directory if it doesn't exist
  const reportsDir = path.dirname(reportPath);
  await fs.mkdir(reportsDir, { recursive: true });

  let reportContent;
  if (format === 'junit') {
    reportContent = convertToJUnit(issues);
  } else {
    reportContent = JSON.stringify({
      summary: {
        total: results.length,
        withIssues: results.filter(r => r.issues.length > 0).length,
        issueCount: issues.length,
        criticalIssues: issues.filter(i => i.level === 'high').length
      },
      results,
      issues
    }, null, 2);
  }

  await fs.writeFile(reportPath, reportContent);
}

function shouldFailBuild(issues, failLevel) {
  const levels = {
    low: 1,
    medium: 2,
    high: 3
  };

  const threshold = levels[failLevel.toLowerCase()] || levels.high;
  return issues.some(issue => {
    const issueLevel = issue.level === 'warning' ? 'medium' : issue.level;
    return levels[issueLevel] >= threshold;
  });
}

module.exports = ciCommand; 