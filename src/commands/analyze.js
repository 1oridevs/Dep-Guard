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

async function analyzeCommand(options = {}) {
  try {
    // Validate project path
    const projectPath = options.path || process.cwd();
    try {
      await validateProjectPath(projectPath);
    } catch (error) {
      throw new ValidationError(`Invalid project path: ${error.message}`, {
        path: projectPath
      });
    }

    const scanner = new DependencyScanner({
      registry: options.registry,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 30000,
      cacheTimeout: options.cacheTimeout || 3600000
    });
    
    // Read and validate package.json
    let packageJson;
    try {
      packageJson = await scanner.readPackageJson(projectPath);
    } catch (error) {
      throw new ValidationError('Failed to parse package.json', {
        path: projectPath,
        error: error.message
      });
    }

    // Get dependencies to analyze
    const dependencies = {
      ...packageJson.dependencies,
      ...(options.dev ? packageJson.devDependencies : {})
    };

    if (!dependencies || Object.keys(dependencies).length === 0) {
      const message = 'No dependencies found';
      if (options.json) {
        console.log(JSON.stringify({
          summary: { total: 0 },
          dependencies: [],
          message
        }));
      } else {
        logger.info(message);
      }
      return;
    }

    // Scan dependencies with timeout
    const timeoutMs = options.timeout || 30000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Analysis timed out')), timeoutMs)
    );

    const results = await Promise.race([
      scanner.scanDependencies(dependencies),
      timeoutPromise
    ]);

    // Format and output results
    if (options.json) {
      console.log(JSON.stringify({
        summary: {
          total: results.length,
          outdated: results.filter(r => r.updateType !== 'none').length,
          errors: results.filter(r => r.error).length
        },
        dependencies: results
      }, null, 2));
    } else {
      logger.info('Dependency Analysis Report');
      logger.info('--------------------------');
      
      results.forEach(dep => {
        if (dep.error) {
          logger.error(`✗ ${dep.name}@${dep.version} - ${dep.error}`);
        } else {
          const status = dep.updateType === 'none' ? '✓' : '!';
          logger.info(`${status} ${dep.name}@${dep.version} -> ${dep.latestVersion}`);
        }
      });

      logger.info('\nSummary:');
      logger.info(`Total Dependencies: ${results.length}`);
      logger.info(`Outdated: ${results.filter(r => r.updateType !== 'none').length}`);
      logger.info(`Errors: ${results.filter(r => r.error).length}`);
    }

    // Exit with error code if required
    if (options.strict && results.some(r => r.error || r.updateType !== 'none')) {
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof DependencyGuardianError) {
      logger.error(`Analysis failed (${error.code}):`, error.message);
      if (options.debug) {
        logger.debug('Error details:', error.details);
      }
    } else {
      logger.error('Analysis failed:', error.message);
    }
    if (options.debug) {
      logger.debug('Stack trace:', error.stack);
    }
    process.exit(1);
  }
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