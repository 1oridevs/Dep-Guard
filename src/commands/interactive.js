const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const securityChecker = require('../core/checkers/security-checker');
const logger = require('../utils/logger');

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

        const mainMenu = async () => {
          const { action } = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'What would you like to do?',
              choices: [
                { name: 'Scan all dependencies', value: 'scan' },
                { name: 'Check specific dependency', value: 'check' },
                { name: 'View security audit', value: 'security' },
                { name: 'View dependency details', value: 'details' },
                { name: 'Remove dependency', value: 'remove' },
                { name: 'Exit', value: 'exit' }
              ]
            }
          ]);

          await handleAction(action);
        };

        const handleAction = async (action) => {
          const spinner = ora();

          switch (action) {
            case 'scan':
              spinner.start('Scanning dependencies...');
              const results = await dependencyScanner.scanDependencies(dependencies);
              spinner.stop();
              displayScanResults(results);
              break;

            case 'security':
              spinner.start('Running security audit...');
              const vulns = await securityChecker.runSecurityAudit(process.cwd());
              spinner.stop();
              
              if (vulns.vulnerabilities.length > 0) {
                console.log(chalk.red('\nVulnerabilities found:'));
                vulns.vulnerabilities.forEach(v => {
                  console.log(`- ${v.title} (${v.severity})`);
                });
              } else {
                console.log(chalk.green('\nNo vulnerabilities found'));
              }
              break;

            case 'exit':
              console.log('Goodbye! 👋');
              process.exit(0);
              break;

            default:
              console.log('Feature not implemented yet');
          }

          if (action !== 'exit') {
            await mainMenu();
          }
        };

        // Start the interactive session
        console.log(chalk.blue('\n🛡️  Dependency Guardian Interactive Mode\n'));
        await mainMenu();

      } catch (error) {
        logger.error('Interactive mode failed:', error);
        process.exit(1);
      }
    });
}

function displayScanResults(results) {
  console.log('\nScan Results:');
  results.forEach(dep => {
    const hasIssues = dep.issues.length > 0;
    const color = hasIssues ? 'yellow' : 'green';
    console.log(chalk[color](`\n${dep.name} (${dep.version})`));
    
    if (hasIssues) {
      dep.issues.forEach(issue => {
        console.log(chalk.dim(`  - ${issue.message}`));
      });
    }
  });
}

module.exports = interactiveCommand; 