const ora = require('ora');
const chalk = require('chalk');
const path = require('path');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const policyChecker = require('../core/policy-checker');
const logger = require('../utils/logger');
const versionUtils = require('../utils/version-utils');
const licenseUtils = require('../utils/license-utils');

async function analyzeCommand(program, config) {
  program
    .command('analyze')
    .description('Perform advanced analysis on dependencies')
    .option('--ci', 'Run in CI mode (exits with error code on issues)')
    .option('--json', 'Output results in JSON format')
    .option('--dev', 'Include devDependencies in analysis')
    .action(async (options) => {
      const spinner = ora('Initializing analysis...').start();
      
      try {
        // Initialize license utils first
        await licenseUtils.init();

        // Create analysis object with initial structure
        const analysis = {
          summary: {
            total: 0,
            issues: 0,
            critical: 0,
            updates: {
              major: 0,
              minor: 0,
              patch: 0,
              prerelease: 0
            },
            licenses: {
              unknown: 0,
              invalid: 0
            }
          },
          dependencies: []
        };

        // Read package.json
        spinner.text = 'Reading package.json...';
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = {
          ...packageJson.dependencies,
          ...(options.dev ? packageJson.devDependencies : {})
        };

        if (!dependencies || Object.keys(dependencies).length === 0) {
          spinner.info('No dependencies found');
          return;
        }

        // Scan dependencies
        spinner.text = 'Scanning dependencies...';
        const results = await dependencyScanner.scanDependencies(dependencies);
        analysis.summary.total = results.length;

        // Process each dependency
        spinner.text = 'Analyzing dependencies...';
        analysis.dependencies = results.map(dep => {
          const issues = [];

          // Check version
          if (!dep.version || !versionUtils.parseVersion(dep.version)) {
            issues.push({
              type: 'version',
              level: 'warning',
              message: `Invalid version format: ${dep.version}`
            });
          }

          // Check updates
          if (dep.updateType && dep.updateType !== 'current') {
            const level = dep.updateType === 'major' ? 'high' : 'warning';
            issues.push({
              type: 'update',
              level,
              message: `${dep.updateType} update available (${dep.version} → ${dep.latestVersion})`
            });
            if (analysis.summary.updates[dep.updateType] !== undefined) {
              analysis.summary.updates[dep.updateType]++;
            }
          }

          // Check license
          if (!dep.license || dep.license === 'UNKNOWN') {
            issues.push({
              type: 'license',
              level: 'warning',
              message: 'No license information found'
            });
            analysis.summary.licenses.unknown++;
          }

          // Update summary counts
          analysis.summary.issues += issues.length;
          analysis.summary.critical += issues.filter(i => i.level === 'high').length;

          return {
            name: dep.name,
            version: dep.version,
            latestVersion: dep.latestVersion,
            updateType: dep.updateType,
            license: dep.license,
            issues
          };
        });

        spinner.succeed('Analysis complete!');

        // Output results
        if (options.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          displayAnalysis(analysis);
        }

        // Exit with error code in CI mode if there are critical issues
        if (options.ci && analysis.summary.critical > 0) {
          process.exit(1);
        }

      } catch (error) {
        spinner.fail(chalk.red(`Analysis failed: ${error.message}`));
        logger.debug('Error details:', error);
        process.exit(1);
      }
    });
}

function displayAnalysis(analysis) {
  console.log('\nDependency Analysis Report');
  console.log('========================\n');

  // Summary
  console.log('Summary:');
  console.log(`Total Dependencies: ${analysis.summary.total}`);
  console.log(`Total Issues: ${analysis.summary.issues}`);
  console.log(`Critical Issues: ${chalk.red(analysis.summary.critical)}\n`);

  // Updates
  console.log('Updates Available:');
  console.log(`Major: ${chalk.red(analysis.summary.updates.major)}`);
  console.log(`Minor: ${chalk.yellow(analysis.summary.updates.minor)}`);
  console.log(`Patch: ${chalk.green(analysis.summary.updates.patch)}`);
  if (analysis.summary.updates.prerelease > 0) {
    console.log(`Pre-release: ${chalk.blue(analysis.summary.updates.prerelease)}`);
  }
  console.log('');

  // License issues
  if (analysis.summary.licenses.unknown > 0) {
    console.log(`Unknown Licenses: ${chalk.yellow(analysis.summary.licenses.unknown)}`);
  }

  // Dependencies with issues
  if (analysis.dependencies.some(dep => dep.issues.length > 0)) {
    console.log('\nDependency Details:');
    analysis.dependencies
      .filter(dep => dep.issues.length > 0)
      .forEach(dep => {
        console.log(`\n${chalk.bold(dep.name)} (${dep.version})`);
        dep.issues.forEach(issue => {
          const color = issue.level === 'high' ? 'red' : 'yellow';
          console.log(chalk[color](`  - [${issue.type}] ${issue.message}`));
        });
      });
  }
}

module.exports = analyzeCommand; 