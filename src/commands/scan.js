const ora = require('ora');
const chalk = require('chalk');
const logger = require('../utils/logger');
const { convertToCSV, convertToHTML } = require('../utils/formatters');
const dependencyScanner = require('../core/dependency-scanner');

async function scanCommand(options) {
  const spinner = ora('Scanning dependencies...').start();
  
  try {
    const projectPath = process.cwd();
    logger.debug('Project path:', projectPath);

    // Read package.json
    const packageJson = await dependencyScanner.readPackageJson(projectPath);
    logger.debug('Package.json found:', packageJson.name);

    const dependencies = packageJson.dependencies || {};
    const depsCount = Object.keys(dependencies).length;
    logger.debug('Dependencies found:', depsCount);
    
    if (depsCount === 0) {
      spinner.info('No dependencies found in package.json');
      return;
    }

    // Perform the scan
    const results = await dependencyScanner.scanDependencies(dependencies);
    spinner.stop();

    // Display results
    if (results.length === 0) {
      logger.success('\n✅ All dependencies are up to date!');
      return;
    }

    // Group results by update type
    const grouped = results.reduce((acc, result) => {
      const type = result.updateType || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(result);
      return acc;
    }, {});

    // Output based on format
    switch (options.format.toLowerCase()) {
      case 'json':
        console.log(JSON.stringify(results, null, 2));
        break;
      case 'csv':
        console.log(convertToCSV(results));
        break;
      case 'html':
        console.log(convertToHTML(results));
        break;
      default:
        displayPrettyScanResults(grouped, depsCount, results.length);
    }

    spinner.succeed('Scan complete! 🎉');

  } catch (error) {
    logger.debug('Scan failed with error:', error);
    spinner.fail(chalk.red(`Scan failed: ${error.message}`));
    process.exit(1);
  }
}

function displayPrettyScanResults(grouped, totalDeps, updateCount) {
  console.log('\n📦 Dependency Scan Results');
  console.log('=======================\n');

  if (grouped.major?.length) {
    console.log(chalk.red('🔴 Major Updates Required:'));
    grouped.major.forEach(displayDependency);
    console.log('');
  }

  if (grouped.minor?.length) {
    console.log(chalk.yellow('🟡 Minor Updates Available:'));
    grouped.minor.forEach(displayDependency);
    console.log('');
  }

  if (grouped.patch?.length) {
    console.log(chalk.blue('🔵 Patch Updates Available:'));
    grouped.patch.forEach(displayDependency);
    console.log('');
  }

  displaySummary(grouped, totalDeps, updateCount);
}

function displayDependency(dep) {
  console.log(chalk.dim('─────────────────────────'));
  console.log(chalk.bold(dep.name));
  console.log(chalk.dim(`Current: ${dep.currentVersion}`));
  console.log(chalk.green(`Latest:  ${dep.latestVersion}`));
  console.log(chalk.dim(`Status:  ${getStatusText(dep.updateType)}`));
}

function getStatusText(updateType) {
  switch (updateType) {
    case 'major':
      return 'Breaking changes (major update)';
    case 'minor':
      return 'New features available';
    case 'patch':
      return 'Bug fixes available';
    default:
      return 'Update available';
  }
}

function displaySummary(grouped, totalDeps, updateCount) {
  console.log(chalk.dim('─────────────────────────'));
  console.log('\n📊 Summary:');
  console.log(chalk.dim('──────────'));
  if (grouped.major) console.log(chalk.red(`Major updates: ${grouped.major.length}`));
  if (grouped.minor) console.log(chalk.yellow(`Minor updates: ${grouped.minor.length}`));
  if (grouped.patch) console.log(chalk.blue(`Patch updates: ${grouped.patch.length}`));
  console.log(chalk.dim(`\nTotal packages checked: ${totalDeps}`));
  console.log(chalk.dim(`Updates needed: ${updateCount}`));
  console.log('\n');
}

module.exports = scanCommand; 