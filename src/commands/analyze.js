const ora = require('ora');
const chalk = require('chalk');
const logger = require('../utils/logger');
const dependencyScanner = require('../core/dependency-scanner');
const { analyzeDependencyTree, detectCircularDependencies } = require('../core/dependency-analyzer');

async function analyzeCommand(options) {
  const spinner = ora('Analyzing dependencies...').start();
  
  try {
    const projectPath = process.cwd();
    const packageJson = await dependencyScanner.readPackageJson(projectPath);
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    // Analyze dependency tree
    const tree = await analyzeDependencyTree(projectPath);
    const circular = detectCircularDependencies(tree);

    spinner.succeed('Dependency tree analysis complete');
    console.log('\nDependency Analysis Results:');
    console.log('----------------------------\n');

    // Display circular dependencies
    if (circular.length > 0) {
      console.log(chalk.red('⚠️ Circular Dependencies Detected:'));
      circular.forEach(cycle => {
        console.log(chalk.dim('• ' + cycle));
      });
    } else {
      console.log(chalk.green('✅ No Circular Dependencies Detected'));
    }

    // Display bundle sizes
    console.log('\nBundle Size Analysis:');
    console.log('-------------------');
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const info = await analyzeBundleSize(name, version);
        if (info) {
          console.log(chalk.dim(`ℹ ${name}@${version}:`),
            `${(info.size / 1024).toFixed(2)}kb (gzipped) |`,
            `${info.dependencyCount} dependencies`);
        }
      } catch (error) {
        logger.debug(`Failed to fetch bundle size for ${name}:`, error);
        console.log(chalk.yellow(`Failed to fetch bundle size for ${name}: ${error.message}`));
      }
    }

    // Display duplicate dependencies if any
    const duplicates = detectDuplicateDependencies(dependencies);
    if (duplicates.length > 0) {
      console.log('\n⚠️ Duplicate Dependencies Found:');
      duplicates.forEach(dep => {
        console.log(chalk.yellow(`• ${dep.name} (${dep.versions.join(', ')})`));
      });
    } else {
      console.log('\n✅ No Duplicate Dependencies Found');
    }

    console.log('\nAnalysis complete! 🎉');

  } catch (error) {
    spinner.fail(chalk.red(`Analysis failed: ${error.message}`));
    logger.debug('Analysis error:', error);
    process.exit(1);
  }
}

module.exports = analyzeCommand; 