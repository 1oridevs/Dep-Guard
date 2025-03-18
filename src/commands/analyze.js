const ora = require('ora');
const chalk = require('chalk');
const path = require('path');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const policyChecker = require('../core/policy-checker');
const logger = require('../utils/logger');
const versionUtils = require('../utils/version-utils');
const licenseUtils = require('../utils/license-utils');
const DependencyScanner = require('../core/analyzers/dependency-scanner');
const fs = require('fs').promises;
const { DependencyGuardianError, NetworkError, ValidationError } = require('../utils/error-utils');
const securityChecker = require('../core/checkers/security-checker');
const { convertToCSV, convertToHTML, formatAnalysisReport } = require('../utils/formatters');

async function validateProjectPath(projectPath) {
  try {
    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      throw new Error('Project path must be a directory');
    }
    
    const packageJsonPath = path.join(projectPath, 'package.json');
    await fs.access(packageJsonPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('package.json not found in project directory');
    }
    throw error;
  }
}

async function analyzeCommand(program) {
  program
    .command('analyze')
    .description('Analyze project dependencies')
    .option('-j, --json', 'Output in JSON format')
    .option('-o, --output <file>', 'Write output to file')
    .option('--strict', 'Exit with error on any issues')
    .action(async (options) => {
      const spinner = ora('Analyzing dependencies...').start();

      try {
        // Read package.json and analyze dependencies
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };

        if (!Object.keys(dependencies).length) {
          spinner.succeed('Analysis complete');
          if (options.json) {
            console.log(JSON.stringify({
              summary: { total: 0, issues: 0 },
              dependencies: []
            }));
          } else {
            console.log('\nNo dependencies found');
          }
          return;
        }

        // Scan dependencies
        const results = await dependencyScanner.scanDependencies(dependencies);
        spinner.succeed('Analysis complete');

        // Process results
        const analysis = {
          summary: {
            total: results.length,
            issues: results.filter(r => r.error || r.issues?.length > 0).length
          },
          dependencies: results
        };

        // Output results
        if (options.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(formatAnalysisReport(analysis));
        }

        // Write to file if specified
        if (options.output) {
          const outputPath = path.resolve(options.output);
          await fs.writeFile(outputPath, 
            options.json ? JSON.stringify(analysis, null, 2) : formatAnalysisReport(analysis)
          );
          logger.info(`Report written to ${outputPath}`);
        }

        // Handle strict mode
        if (options.strict && analysis.summary.issues > 0) {
          process.exit(1);
        }

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('Analysis error:', error);
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