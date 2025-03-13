#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const logger = require('./utils/logger');
const config = require('./utils/config');
const commands = require('./commands');

async function main() {
  try {
    // Load config first
    await config.load();

    // Setup program
    program
      .name('dependency-guardian')
      .description('A CLI tool for managing and securing project dependencies')
      .version('1.0.0');

    // Register commands
    Object.values(commands).forEach(cmd => cmd(program, config));

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }
}

// Run the CLI
if (require.main === module) {
  main();
}

module.exports = main; 