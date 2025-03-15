const ora = require('ora');
const chalk = require('chalk');
const Table = require('cli-table3');
const sizeOptimizer = require('../core/analyzers/size-optimizer');
const logger = require('../utils/logger');

function optimizeCommand(program) {
  program
    .command('optimize')
    .alias('opt')
    .description('Analyze and suggest size optimizations for dependencies')
    .option('-p, --package <name>', 'Analyze specific package')
    .option('-a, --all', 'Analyze all dependencies')
    .option('--min-size <bytes>', 'Minimum size to analyze (in bytes)', 1024)
    .option('--no-cache', 'Skip cache and force fresh analysis')
    .option('-f, --format <type>', 'Output format (text, json)', 'text')
    .action(async (options) => {
      const spinner = ora('Analyzing optimization opportunities...').start();

      try {
        let results = [];

        if (options.package) {
          const result = await sizeOptimizer.analyze(options.package, options);
          results.push(result);
        } else if (options.all) {
          const packageJson = require(path.join(process.cwd(), 'package.json'));
          const dependencies = { ...packageJson.dependencies };
          
          for (const [name] of Object.entries(dependencies)) {
            spinner.text = `Analyzing ${name}...`;
            const result = await sizeOptimizer.analyze(name, options);
            if (result.currentSize >= options.minSize) {
              results.push(result);
            }
          }
        } else {
          spinner.fail('Please specify a package with --package or use --all for all dependencies');
          return;
        }

        spinner.succeed('Optimization analysis complete');

        if (options.format === 'json') {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        // Display results
        results.forEach(result => {
          console.log('\n' + chalk.bold(`Size Optimization: ${result.name}`));
          
          // Current size info
          console.log('\nCurrent Size:');
          console.log(`  Raw: ${sizeOptimizer.formatBytes(result.currentSize)}`);
          console.log(`  Gzipped: ${sizeOptimizer.formatBytes(result.gzipSize)}`);
          
          if (result.potentialSavings > 0) {
            const savingsPercent = ((result.potentialSavings / result.currentSize) * 100).toFixed(1);
            console.log(chalk.green(`\nPotential Savings: ${sizeOptimizer.formatBytes(result.potentialSavings)} (${savingsPercent}%)`));
          }

          // Show suggestions
          if (result.suggestions.length > 0) {
            console.log('\nOptimization Suggestions:');
            result.suggestions.forEach(suggestion => {
              console.log(`\n${chalk.cyan(suggestion.title)}`);
              console.log(chalk.yellow(`  ⚠ ${suggestion.message}`));
              console.log(chalk.gray(`  ${suggestion.details}`));
              
              if (suggestion.potentialSavings) {
                console.log(chalk.green(`  Potential savings: ${sizeOptimizer.formatBytes(suggestion.potentialSavings)}`));
              }

              console.log('\nImplementation:');
              console.log(chalk.gray(suggestion.implementation));
            });
          } else {
            console.log(chalk.green('\n✓ Package is already well optimized'));
          }
        });

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('Optimization analysis error:', error);
        process.exit(1);
      }
    });
}

module.exports = optimizeCommand; 