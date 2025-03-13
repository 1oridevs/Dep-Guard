#!/usr/bin/env node

const { program } = require('commander');
const commands = require('./commands');
const logger = require('./utils/logger');
const { loadConfig } = require('./utils/config');

async function main() {
  try {
    // Load configuration
    const config = await loadConfig();

    // Set up debug mode if needed
    if (process.env.DEBUG || config.debug) {
      logger.setDebug(true);
    }

    // Register commands
    commands.forEach(cmd => cmd(program, config));

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = main; 