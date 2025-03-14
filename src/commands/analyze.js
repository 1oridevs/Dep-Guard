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
  // Title
  console.log('\n' + chalk.bold.blue('╭─────────────────────────────────────╮'));
  console.log(chalk.bold.blue('│      Dependency Guardian Report      │'));
  console.log(chalk.bold.blue('╰─────────────────────────────────────╯\n'));

  // Quick Stats
  const stats = [
    { icon: '📦', label: 'Dependencies', value: analysis.summary.total, color: 'white' },
    { icon: '⚠️', label: 'Issues', value: analysis.summary.issues, color: 'yellow' },
    { icon: '🚨', label: 'Critical', value: analysis.summary.critical, color: 'red' }
  ];

  const maxLabelLength = Math.max(...stats.map(s => s.label.length));
  stats.forEach(stat => {
    const padding = ' '.repeat(maxLabelLength - stat.label.length);
    console.log(`${stat.icon}  ${chalk.dim(stat.label + ':')}${padding} ${chalk[stat.color].bold(stat.value)}`);
  });

  // Updates Overview
  const updates = analysis.summary.updates;
  const totalUpdates = updates.major + updates.minor + updates.patch;
  
  if (totalUpdates > 0) {
    console.log('\n' + chalk.bold.yellow('╭─ Available Updates ──────────────────╮'));
    
    const updateTypes = [
      { type: 'major', icon: '⬆️', label: 'Major Updates', color: 'red', count: updates.major },
      { type: 'minor', icon: '↗️', label: 'Minor Updates', color: 'yellow', count: updates.minor },
      { type: 'patch', icon: '✨', label: 'Patch Updates', color: 'green', count: updates.patch }
    ].filter(u => u.count > 0);

    updateTypes.forEach(update => {
      console.log(`${update.icon}  ${chalk.dim(update.label)}: ${chalk[update.color].bold(update.count)}`);
    });
    
    console.log(chalk.bold.yellow('╰────────────────────────────────────╯'));
  }

  // Detailed Dependencies Section
  const depsWithIssues = analysis.dependencies.filter(dep => dep.issues.length > 0);
  
  if (depsWithIssues.length > 0) {
    console.log('\n' + chalk.bold.magenta('╭─ Dependency Details ─────────────────╮'));
    
    depsWithIssues.forEach((dep, index) => {
      // Package name with version
      console.log(`\n${chalk.bold(dep.name)} ${chalk.dim(`v${dep.version}`)}`);
      
      // Update information
      const updateIssue = dep.issues.find(i => i.type === 'update');
      if (updateIssue) {
        const arrow = updateIssue.level === 'high' ? '⬆️' : '↗️';
        console.log(`${arrow}  ${chalk.dim('Update:')} ${dep.latestVersion} ${chalk.dim('available')}`);
      }

      // License information
      const licenseIssue = dep.issues.find(i => i.type === 'license');
      if (licenseIssue) {
        console.log(`📜  ${chalk.yellow('License:')} ${licenseIssue.message}`);
      }

      // Other issues
      const otherIssues = dep.issues.filter(i => !['update', 'license'].includes(i.type));
      otherIssues.forEach(issue => {
        console.log(`❗  ${chalk.red(issue.message)}`);
      });

      // Separator between dependencies
      if (index < depsWithIssues.length - 1) {
        console.log(chalk.dim('├' + '─'.repeat(38)));
      }
    });
    
    console.log(chalk.bold.magenta('\n╰────────────────────────────────────╯'));
  }

  // Action Items
  if (analysis.summary.issues > 0) {
    console.log('\n' + chalk.bold.cyan('╭─ Recommended Actions ────────────────╮'));
    
    if (updates.major > 0) {
      console.log(`🔍  ${chalk.dim('Review')} ${chalk.red.bold(updates.major)} major updates ${chalk.dim('(breaking changes)')}`);
    }
    if (updates.minor > 0) {
      console.log(`📦  ${chalk.dim('Update')} ${chalk.yellow.bold(updates.minor)} packages ${chalk.dim('with new features')}`);
    }
    if (updates.patch > 0) {
      console.log(`🛡️   ${chalk.dim('Apply')} ${chalk.green.bold(updates.patch)} security patches`);
    }
    if (analysis.summary.licenses?.unknown > 0) {
      console.log(`📜  ${chalk.dim('Verify')} ${chalk.yellow.bold(analysis.summary.licenses.unknown)} unknown licenses`);
    }
    
    console.log(chalk.bold.cyan('╰────────────────────────────────────╯\n'));
  }
}

module.exports = analyzeCommand; 