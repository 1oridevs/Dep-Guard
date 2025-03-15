const ora = require('ora');
const chalk = require('chalk');
const Table = require('cli-table3');
const bundleAnalyzer = require('../core/analyzers/bundle-analyzer');
const logger = require('../utils/logger');

function bundleCommand(program) {
  program
    .command('bundle')
    .description('Analyze bundle size and impact of dependencies')
    .option('-p, --package <name>', 'Analyze specific package')
    .option('-a, --all', 'Analyze all dependencies')
    .option('--no-cache', 'Skip cache and force fresh analysis')
    .option('-f, --format <type>', 'Output format (text, json)', 'text')
    .action(async (options) => {
      const spinner = ora('Analyzing bundle sizes...').start();

      try {
        let results = [];

        if (options.package) {
          const result = await bundleAnalyzer.analyze(options.package, options);
          results.push(result);
        } else if (options.all) {
          const packageJson = require(path.join(process.cwd(), 'package.json'));
          const dependencies = { ...packageJson.dependencies };
          
          for (const [name] of Object.entries(dependencies)) {
            spinner.text = `Analyzing ${name}...`;
            const result = await bundleAnalyzer.analyze(name, options);
            results.push(result);
          }
        } else {
          spinner.fail('Please specify a package with --package or use --all for all dependencies');
          return;
        }

        spinner.succeed('Bundle analysis complete');

        if (options.format === 'json') {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        // Display results in a table
        const table = new Table({
          head: ['Package', 'Size (min+gz)', 'Impact', 'Tree-shaking'],
          style: { head: ['cyan'] }
        });

        results.forEach(result => {
          table.push([
            result.name,
            `${bundleAnalyzer.formatBytes(result.stats.gzip)}`,
            `${result.impact.relative.toFixed(1)}%`,
            result.treeshaking.savings > 0 ? 
              chalk.yellow(`-${bundleAnalyzer.formatBytes(result.treeshaking.savings)} possible`) :
              chalk.green('optimized')
          ]);
        });

        console.log(table.toString());

        // Show suggestions
        results.forEach(result => {
          if (result.suggestions.length > 0) {
            console.log(`\n${chalk.bold(result.name)} suggestions:`);
            result.suggestions.forEach(suggestion => {
              const color = suggestion.level === 'warning' ? 'yellow' : 'blue';
              console.log(chalk[color](`  ⚠ ${suggestion.message}`));
              console.log(chalk.gray(`    ${suggestion.recommendation}`));
            });
          }
        });

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('Bundle analysis error:', error);
        process.exit(1);
      }
    });
}

module.exports = bundleCommand; 