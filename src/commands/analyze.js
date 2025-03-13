const ora = require('ora');
const chalk = require('chalk');
const path = require('path');
const dependencyScanner = require('../core/dependency-scanner');
const policyChecker = require('../core/policy-checker');
const licenseChecker = require('../core/license-checker');
const logger = require('../utils/logger');
const { analyzeDependencyTree, detectCircularDependencies } = require('../core/dependency-analyzer');

async function analyzeCommand(program, config) {
  program
    .command('analyze')
    .description('Perform deep analysis of dependencies')
    .option('-p, --policy <path>', 'Path to custom policy file')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      const spinner = ora('Analyzing dependencies...').start();
      
      try {
        // Load policy
        const policy = await policyChecker.loadPolicy(options.policy);
        
        // Read package.json
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = packageJson.dependencies || {};
        
        // Analyze dependencies
        const analysis = {
          dependencies: await analyzeDependencies(dependencies, policy),
          policy: await validatePolicy(policy),
          summary: {
            total: Object.keys(dependencies).length,
            issues: 0,
            criticalIssues: 0
          }
        };

        // Update summary
        analysis.dependencies.forEach(dep => {
          if (dep.issues.length > 0) {
            analysis.summary.issues += dep.issues.length;
            if (dep.issues.some(i => i.level === 'high')) {
              analysis.summary.criticalIssues++;
            }
          }
        });

        spinner.stop();

        // Output results
        if (options.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          displayAnalysis(analysis);
        }

        // Exit with error if critical issues found
        if (analysis.summary.criticalIssues > 0) {
          process.exit(1);
        }

      } catch (error) {
        spinner.fail(chalk.red(`Analysis failed: ${error.message}`));
        logger.debug('Error details:', error);
        process.exit(1);
      }
    });
}

async function analyzeDependencies(dependencies, policy) {
  const results = [];

  for (const [name, version] of Object.entries(dependencies)) {
    const dep = {
      name,
      version,
      issues: [],
      license: null,
      updates: null
    };

    // Check license
    const licenseInfo = await licenseChecker.checkLicense(name, version);
    dep.license = licenseInfo;

    // Check updates
    const latestVersion = await dependencyScanner.getLatestVersion(name);
    dep.updates = {
      latest: latestVersion,
      type: dependencyScanner.determineUpdateType(version, latestVersion)
    };

    // Check against policy
    const policyIssues = await policyChecker.checkDependency({
      name,
      version,
      license: licenseInfo?.name,
      updateType: dep.updates.type
    }, policy);

    dep.issues.push(...policyIssues);
    results.push(dep);
  }

  return results;
}

async function validatePolicy(policy) {
  const validation = await policyChecker.validatePolicy(policy);
  return {
    valid: validation.errors.length === 0,
    errors: validation.errors,
    warnings: validation.warnings
  };
}

function displayAnalysis(analysis) {
  console.log(chalk.bold('\nDependency Analysis Report'));
  console.log('=========================');

  console.log(chalk.bold('\nSummary:'));
  console.log(`Total Dependencies: ${analysis.summary.total}`);
  console.log(`Total Issues: ${analysis.summary.issues}`);
  console.log(`Critical Issues: ${chalk.red(analysis.summary.criticalIssues)}`);

  if (analysis.dependencies.length > 0) {
    console.log(chalk.bold('\nDependency Details:'));
    analysis.dependencies.forEach(dep => {
      if (dep.issues.length > 0) {
        console.log(`\n${chalk.yellow(dep.name)} (${dep.version}):`);
        dep.issues.forEach(issue => {
          console.log(chalk[issue.level === 'high' ? 'red' : 'yellow'](
            `  - [${issue.type}] ${issue.message}`
          ));
        });
      }
    });
  }

  if (!analysis.policy.valid) {
    console.log(chalk.bold('\nPolicy Validation:'));
    analysis.policy.errors.forEach(error => {
      console.log(chalk.red(`- ${error}`));
    });
    analysis.policy.warnings.forEach(warning => {
      console.log(chalk.yellow(`- ${warning}`));
    });
  }
}

module.exports = analyzeCommand; 