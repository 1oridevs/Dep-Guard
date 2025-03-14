const ora = require('ora');
const chalk = require('chalk');
const madge = require('madge');
const dependencyTree = require('dependency-tree');
const logger = require('../utils/logger');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function treeCommand(program) {
  program
    .command('tree')
    .description('Visualize and analyze dependency relationships')
    .option('-d, --depth <number>', 'Maximum depth to display', '4')
    .option('--circular', 'Check for circular dependencies')
    .option('--duplicates', 'Find duplicate dependencies')
    .option('--graph', 'Generate a dependency graph (requires Graphviz)')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      const spinner = ora('Analyzing dependencies...').start();

      try {
        // Get package dependencies
        const { dependencies, devDependencies } = require(process.cwd() + '/package.json');
        const allDeps = { ...dependencies, ...devDependencies };

        // Build dependency tree
        const tree = await buildDependencyTree(allDeps, parseInt(options.depth));
        spinner.succeed('Analysis complete');

        if (options.circular) {
          await findCircularDependencies();
        }

        if (options.duplicates) {
          await findDuplicateDependencies();
        }

        if (options.graph) {
          await generateDependencyGraph();
        }

        if (options.json) {
          console.log(JSON.stringify(tree, null, 2));
        } else {
          displayTree(tree);
        }

      } catch (error) {
        spinner.fail('Error analyzing dependencies');
        logger.error('Analysis failed:', error);
        process.exit(1);
      }
    });
}

async function buildDependencyTree(dependencies, maxDepth) {
  const tree = {};
  const seen = new Set();

  async function buildTree(deps, depth = 0) {
    if (depth >= maxDepth) return null;

    const result = {};
    for (const [name, version] of Object.entries(deps)) {
      if (seen.has(name)) {
        result[name] = '[Circular]';
        continue;
      }

      seen.add(name);
      try {
        const packagePath = require.resolve(`${name}/package.json`);
        const packageJson = require(packagePath);
        result[name] = {
          version: packageJson.version,
          dependencies: await buildTree(packageJson.dependencies || {}, depth + 1)
        };
      } catch (error) {
        result[name] = {
          version: version,
          error: 'Failed to resolve package'
        };
      }
      seen.delete(name);
    }
    return result;
  }

  return buildTree(dependencies);
}

async function findCircularDependencies() {
  console.log(chalk.blue('\nChecking for circular dependencies...'));
  
  try {
    const result = await madge(process.cwd(), {
      excludeRegExp: [/node_modules/]
    });

    const circular = result.circular();
    if (circular.length > 0) {
      console.log(chalk.red('\n⚠️ Circular Dependencies Found:'));
      circular.forEach(path => {
        console.log(chalk.red(`  ■ ${path.join(' → ')}`));
      });
    } else {
      console.log(chalk.green('✓ No circular dependencies found'));
    }
  } catch (error) {
    logger.error('Failed to check circular dependencies:', error);
  }
}

async function findDuplicateDependencies() {
  console.log(chalk.blue('\nChecking for duplicate dependencies...'));
  
  try {
    const { stdout } = await execPromise('npm ls --json');
    const deps = JSON.parse(stdout);
    const versions = new Map();

    function traverse(obj, path = []) {
      if (!obj.dependencies) return;

      Object.entries(obj.dependencies).forEach(([name, info]) => {
        if (!versions.has(name)) {
          versions.set(name, new Map());
        }
        const packageVersions = versions.get(name);
        const version = info.version;
        
        if (!packageVersions.has(version)) {
          packageVersions.set(version, []);
        }
        packageVersions.get(version).push([...path, name].join('/'));
        
        traverse(info, [...path, name]);
      });
    }

    traverse(deps);

    let hasDuplicates = false;
    versions.forEach((packageVersions, name) => {
      if (packageVersions.size > 1) {
        if (!hasDuplicates) {
          console.log(chalk.yellow('\n📦 Duplicate Dependencies:'));
          hasDuplicates = true;
        }
        console.log(chalk.yellow(`\n  ${name}:`));
        packageVersions.forEach((paths, version) => {
          console.log(chalk.yellow(`    ${version}:`));
          paths.forEach(path => {
            console.log(chalk.yellow(`      ■ ${path}`));
          });
        });
      }
    });

    if (!hasDuplicates) {
      console.log(chalk.green('✓ No duplicate dependencies found'));
    }
  } catch (error) {
    logger.error('Failed to check duplicate dependencies:', error);
  }
}

async function generateDependencyGraph() {
  console.log(chalk.blue('\nGenerating dependency graph...'));
  
  try {
    const result = await madge(process.cwd(), {
      excludeRegExp: [/node_modules/],
      graphVizOptions: {
        G: {
          rankdir: 'LR'
        }
      }
    });

    await result.image('dependency-graph.svg');
    console.log(chalk.green('✓ Generated dependency graph: dependency-graph.svg'));
  } catch (error) {
    logger.error('Failed to generate dependency graph:', error);
    console.log(chalk.yellow('Note: Generating graphs requires Graphviz to be installed'));
  }
}

function displayTree(tree, prefix = '', isLast = true) {
  Object.entries(tree).forEach(([name, info], index, array) => {
    const isLastEntry = index === array.length - 1;
    const marker = isLastEntry ? '└── ' : '├── ';
    const version = info.version || 'unknown';
    
    console.log(`${prefix}${marker}${chalk.cyan(name)} ${chalk.gray(`v${version}`)}`);
    
    if (info.dependencies && Object.keys(info.dependencies).length > 0) {
      const newPrefix = prefix + (isLastEntry ? '    ' : '│   ');
      displayTree(info.dependencies, newPrefix, isLastEntry);
    }
  });
}

module.exports = treeCommand; 