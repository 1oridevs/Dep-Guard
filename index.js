#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const program = new Command();

program
  .name('dependency-guardian')
  .description('A CLI tool to scan Node.js project dependencies for outdated packages, license compliance, and vulnerabilities')
  .version('1.0.0');

function displayWelcome() {
  console.log(chalk.blue.bold('\n🛡️  Welcome to Dependency Guardian 🛡️\n'));
}

async function readPackageJson(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const data = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(data);
}

async function getLatestVersion(packageName) {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
    return response.data['dist-tags'].latest;
  } catch (error) {
    return null;
  }
}

function compareVersions(current, latest) {
  if (!latest) return 'ERROR';
  if (current.startsWith('^') || current.startsWith('~')) {
    current = current.substring(1);
  }
  return current === latest ? 'UP-TO-DATE' : 'UPDATE AVAILABLE';
}

async function scanDependencies(dependencies, type = 'dependencies') {
  const results = [];
  
  for (const [name, version] of Object.entries(dependencies)) {
    const latestVersion = await getLatestVersion(name);
    const status = compareVersions(version, latestVersion);
    
    results.push({
      name,
      type,
      currentVersion: version,
      latestVersion: latestVersion || 'Unknown',
      status
    });
  }
  
  return results;
}

function displayResults(results) {
  console.log('\nDependency Scan Results:\n');
  
  const grouped = results.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([type, deps]) => {
    console.log(chalk.cyan.bold(`\n${type}:`));
    deps.forEach(({ name, currentVersion, latestVersion, status }) => {
      const statusColor = {
        'UP-TO-DATE': 'green',
        'UPDATE AVAILABLE': 'yellow',
        'ERROR': 'red'
      }[status];
      
      console.log(
        `${chalk.bold(name)} - ` +
        `Current: ${chalk.blue(currentVersion)} | ` +
        `Latest: ${chalk.blue(latestVersion)} | ` +
        `Status: ${chalk[statusColor](status)}`
      );
    });
  });

  displaySummary(results);
}

function displaySummary(results) {
  const summary = results.reduce((acc, { status }) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  console.log(chalk.bold('\nSummary:'));
  console.log('----------------------------------------');
  console.log(`✅ Up-to-date: ${chalk.green(summary['UP-TO-DATE'] || 0)}`);
  console.log(`⚠️  Updates available: ${chalk.yellow(summary['UPDATE AVAILABLE'] || 0)}`);
  console.log(`❌ Errors: ${chalk.red(summary['ERROR'] || 0)}`);
  console.log(`📦 Total packages scanned: ${chalk.blue(results.length)}`);
  console.log('----------------------------------------\n');
}

program
  .command('scan')
  .description('Scan project dependencies for issues')
  .option('-p, --path <path>', 'path to project directory', '.')
  .option('-d, --include-dev', 'include devDependencies in scan', false)
  .action(async (options) => {
    try {
      displayWelcome();
      console.log(chalk.yellow('Scanning dependencies...'));
      console.log(chalk.dim(`Project path: ${options.path}`));
      
      const packageJson = await readPackageJson(options.path);
      let results = [];

      if (Object.keys(packageJson.dependencies || {}).length > 0) {
        const dependencyResults = await scanDependencies(packageJson.dependencies || {}, 'dependencies');
        results = results.concat(dependencyResults);
      }

      if (options.includeDev && Object.keys(packageJson.devDependencies || {}).length > 0) {
        const devDependencyResults = await scanDependencies(packageJson.devDependencies || {}, 'devDependencies');
        results = results.concat(devDependencyResults);
      }

      if (results.length === 0) {
        console.log(chalk.yellow('\nNo dependencies found to scan!'));
        return;
      }

      displayResults(results);
      
    } catch (error) {
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

program.on('command:*', function () {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  displayWelcome();
  program.help();
}
