const ora = require('ora');
const chalk = require('chalk');
const Table = require('cli-table3');
const performanceAnalyzer = require('../core/analyzers/performance-analyzer');
const logger = require('../utils/logger');

function performanceCommand(program) {
  program
    .command('performance')
    .alias('perf')
    .description('Analyze performance metrics of dependencies')
    .option('-p, --package <name>', 'Analyze specific package')
    .option('-a, --all', 'Analyze all dependencies')
    .option('--no-cache', 'Skip cache and force fresh analysis')
    .option('-f, --format <type>', 'Output format (text, json)', 'text')
    .action(async (options) => {
      const spinner = ora('Analyzing performance metrics...').start();

      try {
        let results = [];

        if (options.package) {
          const result = await performanceAnalyzer.analyze(options.package, options);
          results.push(result);
        } else if (options.all) {
          const packageJson = require(path.join(process.cwd(), 'package.json'));
          const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
          
          for (const [name] of Object.entries(dependencies)) {
            spinner.text = `Analyzing ${name}...`;
            const result = await performanceAnalyzer.analyze(name, options);
            results.push(result);
          }
        } else {
          spinner.fail('Please specify a package with --package or use --all for all dependencies');
          return;
        }

        spinner.succeed('Performance analysis complete');

        if (options.format === 'json') {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        // Display results in a table
        const table = new Table({
          head: ['Package', 'Load Time', 'Memory Usage', 'Bundle Size', 'Import Cost'],
          style: { head: ['cyan'] }
        });

        results.forEach(result => {
          table.push([
            result.name,
            `${result.metrics.loadTime.value.toFixed(2)} ms`,
            `${(result.metrics.memoryUsage.heapUsed.value / 1024).toFixed(2)} KB`,
            `${(result.metrics.bundleSize.raw.value / 1024).toFixed(2)} KB`,
            `${result.metrics.importCost.importTime.value.toFixed(2)} ms`
          ]);
        });

        console.log(table.toString());

        // Show warnings for potential issues
        results.forEach(result => {
          const warnings = [];
          
          if (result.metrics.loadTime.value > 100) {
            warnings.push(chalk.yellow('⚠ High load time'));
          }
          if (result.metrics.memoryUsage.heapUsed.value > 5 * 1024 * 1024) {
            warnings.push(chalk.yellow('⚠ High memory usage'));
          }
          if (result.metrics.bundleSize.raw.value > 1024 * 1024) {
            warnings.push(chalk.yellow('⚠ Large bundle size'));
          }

          if (warnings.length > 0) {
            console.log(`\n${chalk.bold(result.name)} warnings:`);
            warnings.forEach(warning => console.log(warning));
          }
        });

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('Performance analysis error:', error);
        process.exit(1);
      }
    });
}

module.exports = performanceCommand; 