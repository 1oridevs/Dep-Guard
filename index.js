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

async function getPackageInfo(packageName) {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
    const latestVersion = response.data['dist-tags'].latest;
    const license = response.data.versions[latestVersion].license || 'Unknown';
    return { latestVersion, license };
  } catch (error) {
    return { latestVersion: null, license: 'Unknown' };
  }
}

function compareVersions(current, latest) {
  if (!latest) return 'ERROR';
  if (current.startsWith('^') || current.startsWith('~')) {
    current = current.substring(1);
  }
  return current === latest ? 'UP-TO-DATE' : 'UPDATE AVAILABLE';
}

function checkLicenseCompliance(license, allowedLicenses) {
  if (!license || license === 'Unknown') return 'UNKNOWN';
  return allowedLicenses.includes(license) ? 'COMPLIANT' : 'NON-COMPLIANT';
}

async function scanDependencies(dependencies, type = 'dependencies', allowedLicenses) {
  const results = [];
  
  for (const [name, version] of Object.entries(dependencies)) {
    const { latestVersion, license } = await getPackageInfo(name);
    const versionStatus = compareVersions(version, latestVersion);
    const licenseStatus = checkLicenseCompliance(license, allowedLicenses);
    
    results.push({
      name,
      type,
      currentVersion: version,
      latestVersion: latestVersion || 'Unknown',
      license,
      versionStatus,
      licenseStatus
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
    deps.forEach(({ name, currentVersion, latestVersion, license, versionStatus, licenseStatus }) => {
      const versionStatusColor = {
        'UP-TO-DATE': 'green',
        'UPDATE AVAILABLE': 'yellow',
        'ERROR': 'red'
      }[versionStatus];

      const licenseStatusColor = {
        'COMPLIANT': 'green',
        'NON-COMPLIANT': 'red',
        'UNKNOWN': 'yellow'
      }[licenseStatus];
      
      console.log(
        `${chalk.bold(name)} - ` +
        `Current: ${chalk.blue(currentVersion)} | ` +
        `Latest: ${chalk.blue(latestVersion)} | ` +
        `License: ${chalk[licenseStatusColor](license)} | ` +
        `Version: ${chalk[versionStatusColor](versionStatus)}`
      );
    });
  });

  displaySummary(results);
}

function displaySummary(results) {
  const summary = results.reduce((acc, { versionStatus, licenseStatus }) => {
    acc.versions[versionStatus] = (acc.versions[versionStatus] || 0) + 1;
    acc.licenses[licenseStatus] = (acc.licenses[licenseStatus] || 0) + 1;
    return acc;
  }, { versions: {}, licenses: {} });

  console.log(chalk.bold('\nSummary:'));
  console.log('----------------------------------------');
  console.log(chalk.bold('\nVersion Status:'));
  console.log(`✅ Up-to-date: ${chalk.green(summary.versions['UP-TO-DATE'] || 0)}`);
  console.log(`⚠️  Updates available: ${chalk.yellow(summary.versions['UPDATE AVAILABLE'] || 0)}`);
  console.log(`❌ Errors: ${chalk.red(summary.versions['ERROR'] || 0)}`);
  
  console.log(chalk.bold('\nLicense Status:'));
  console.log(`✅ Compliant: ${chalk.green(summary.licenses['COMPLIANT'] || 0)}`);
  console.log(`❌ Non-compliant: ${chalk.red(summary.licenses['NON-COMPLIANT'] || 0)}`);
  console.log(`⚠️  Unknown: ${chalk.yellow(summary.licenses['UNKNOWN'] || 0)}`);
  
  console.log(`\n📦 Total packages scanned: ${chalk.blue(results.length)}`);
  console.log('----------------------------------------\n');
}

program
  .command('scan')
  .description('Scan project dependencies for issues')
  .option('-p, --path <path>', 'path to project directory', '.')
  .option('-d, --include-dev', 'include devDependencies in scan', false)
  .option('-l, --licenses <licenses>', 'allowed licenses (comma-separated)', 'MIT,ISC,Apache-2.0,BSD-3-Clause')
  .action(async (options) => {
    try {
      displayWelcome();
      console.log(chalk.yellow('Scanning dependencies...'));
      console.log(chalk.dim(`Project path: ${options.path}`));
      
      const allowedLicenses = options.licenses.split(',').map(l => l.trim());
      console.log(chalk.dim(`Allowed licenses: ${allowedLicenses.join(', ')}`));
      
      const packageJson = await readPackageJson(options.path);
      let results = [];

      if (Object.keys(packageJson.dependencies || {}).length > 0) {
        const dependencyResults = await scanDependencies(packageJson.dependencies || {}, 'dependencies', allowedLicenses);
        results = results.concat(dependencyResults);
      }

      if (options.includeDev && Object.keys(packageJson.devDependencies || {}).length > 0) {
        const devDependencyResults = await scanDependencies(packageJson.devDependencies || {}, 'devDependencies', allowedLicenses);
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
