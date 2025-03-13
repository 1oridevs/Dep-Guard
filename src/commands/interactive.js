const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const logger = require('../utils/logger');
const dependencyScanner = require('../core/dependency-scanner');
const securityChecker = require('../core/security-checker');

async function interactiveCommand(program, config) {
  program
    .command('interactive')
    .description('Start interactive dependency management mode')
    .action(async () => {
      try {
        const spinner = ora('Loading project dependencies...').start();
        const packageJson = await dependencyScanner.readPackageJson(process.cwd());
        const dependencies = packageJson.dependencies || {};
        spinner.stop();

        const choices = Object.entries(dependencies).map(([name, version]) => ({
          name: `${name} (${version})`,
          value: { name, version }
        }));

        const { dep } = await inquirer.prompt([
          {
            type: 'list',
            name: 'dep',
            message: 'Select a dependency to manage:',
            choices
          }
        ]);

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: `What would you like to do with ${dep.name}?`,
            choices: [
              { name: 'Check for updates', value: 'update' },
              { name: 'Run security audit', value: 'security' },
              { name: 'View details', value: 'details' },
              { name: 'Remove dependency', value: 'remove' }
            ]
          }
        ]);

        await handleAction(action, dep);

      } catch (error) {
        logger.error('Interactive mode failed:', error);
        process.exit(1);
      }
    });
}

async function handleAction(action, dep) {
  const spinner = ora('Processing...').start();

  try {
    switch (action) {
      case 'update':
        const latest = await dependencyScanner.getLatestVersion(dep.name);
        spinner.stop();
        console.log(`\nCurrent version: ${chalk.yellow(dep.version)}`);
        console.log(`Latest version: ${chalk.green(latest)}`);
        break;

      case 'security':
        const vulns = await securityChecker.checkVulnerabilityDatabase(dep.name, dep.version);
        spinner.stop();
        if (vulns?.vulnerabilities?.length) {
          console.log(chalk.red('\nVulnerabilities found:'));
          vulns.vulnerabilities.forEach(v => {
            console.log(`- ${v.title} (${v.severity})`);
          });
        } else {
          console.log(chalk.green('\nNo vulnerabilities found'));
        }
        break;

      case 'details':
        // Implementation for viewing details
        break;

      case 'remove':
        // Implementation for removing dependency
        break;
    }
  } catch (error) {
    spinner.fail(`Action failed: ${error.message}`);
  }
}

module.exports = interactiveCommand; 