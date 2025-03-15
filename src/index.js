#!/usr/bin/env node

const { Command } = require('commander');
const commands = require('./commands');
const logger = require('./utils/logger');

async function main() {
  try {
    const program = new Command();

    program
      .name('dependency-guardian')
      .alias('dg')
      .description('A powerful dependency management and analysis tool for Node.js projects')
      .version(require('../package.json').version);

    // Add completion command
    program
      .command('completion')
      .description('Generate shell completion script')
      .argument('<shell>', 'Shell type: bash, zsh, or fish')
      .action(async (shell) => {
        try {
          const completion = await require('./utils/completion').generateCompletion(shell);
          console.log(completion);
        } catch (error) {
          console.error('Failed to generate completion script:', error.message);
          process.exit(1);
        }
      });

    // Register all commands
    commands.forEach(command => {
      if (typeof command === 'function') {
        command(program);
      } else {
        logger.warn(`Skipping invalid command: ${command}`);
      }
    });

    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main(); 