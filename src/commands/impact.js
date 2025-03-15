const ora = require('ora');
const chalk = require('chalk');
const Table = require('cli-table3');
const impactAnalyzer = require('../core/analyzers/impact-analyzer');
const logger = require('../utils/logger');

function impactCommand(program) {
  program
    .command('impact')
    .description('Analyze the full impact of dependencies')
    .option('-p, --package <name>', 'Analyze specific package')
    .option('-a, --all', 'Analyze all dependencies')
    .option('--no-cache', 'Skip cache and force fresh analysis')
    .option('-f, --format <type>', 'Output format (text, json)', 'text')
    .option('-d, --detailed', 'Show detailed impact analysis')
    .action(async (options) => {
      const spinner = ora('Analyzing dependency impact...').start();

      try {
        let results = [];

        if (options.package) {
          const result = await impactAnalyzer.analyze(options.package, options);
          results.push(result);
        } else if (options.all) {
          const packageJson = require(path.join(process.cwd(), 'package.json'));
          const dependencies = { ...packageJson.dependencies };
          
          for (const [name] of Object.entries(dependencies)) {
            spinner.text = `Analyzing ${name}...`;
            const result = await impactAnalyzer.analyze(name, options);
            results.push(result);
          }
        } else {
          spinner.fail('Please specify a package with --package or use --all for all dependencies');
          return;
        }

        spinner.succeed('Impact analysis complete');

        if (options.format === 'json') {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        // Display results
        results.forEach(result => {
          console.log('\n' + chalk.bold(`Impact Analysis: ${result.name}`));
          
          // Impact score
          const scoreColor = result.score > 0.7 ? 'green' : result.score > 0.4 ? 'yellow' : 'red';
          console.log(`\nImpact Score: ${chalk[scoreColor](result.score.toFixed(2))}`);

          // Summary table
          const table = new Table({
            head: ['Category', 'Metric', 'Value'],
            style: { head: ['cyan'] }
          });

          table.push(
            ['Bundle', 'Size Impact', `${result.bundle.impact.relative.toFixed(1)}%`],
            ['', 'Tree-shaking Potential', `${result.bundle.treeshaking.savings > 0 ? '✓' : '✗'}`],
            ['Dependencies', 'Direct Dependencies', result.dependencies.directDependencies],
            ['', 'Transitive Dependencies', result.dependencies.transitiveCount],
            ['Codebase', 'Impacted Files', `${result.codebase.impactedFiles}/${result.codebase.totalFiles}`],
            ['', 'Usage Count', result.codebase.usageCount],
            ['Performance', 'Load Time', `${result.performance.metrics.loadTime.toFixed(2)}ms`],
            ['', 'Memory Usage', `${(result.performance.metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`]
          );

          console.log(table.toString());

          // Show suggestions
          if (result.suggestions.length > 0) {
            console.log('\nSuggestions:');
            result.suggestions.forEach(suggestion => {
              const color = suggestion.level === 'warning' ? 'yellow' : 'blue';
              console.log(chalk[color](`  ⚠ ${suggestion.message}`));
              console.log(chalk.gray(`    ${suggestion.recommendation}`));
            });
          }

          // Show detailed analysis if requested
          if (options.detailed) {
            console.log('\nDetailed Analysis:');
            // ... add detailed analysis output
          }
        });

      } catch (error) {
        spinner.fail('Analysis failed');
        logger.error('Impact analysis error:', error);
        process.exit(1);
      }
    });
}

module.exports = impactCommand; 