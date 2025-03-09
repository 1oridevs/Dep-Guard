#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const program = new Command();

program
  .name('dependency-guardian')
  .description('A CLI tool to scan Node.js project dependencies for outdated packages, license compliance, and vulnerabilities')
  .version('1.0.0');

function displayWelcome() {
  console.log(chalk.blue.bold('\n🛡️  Welcome to Dependency Guardian 🛡️\n'));
}

program
  .command('scan')
  .description('Scan project dependencies for issues')
  .option('-p, --path <path>', 'path to project directory', '.')
  .action((options) => {
    displayWelcome();
    console.log(chalk.yellow('Scanning dependencies...'));
    console.log(chalk.dim(`Project path: ${options.path}`));
    // TODO: Implement scanning functionality
    console.log(chalk.gray('Scanning functionality will be implemented in the next phase.'));
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
