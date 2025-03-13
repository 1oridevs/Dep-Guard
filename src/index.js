#!/usr/bin/env node

const { program } = require('commander');
const logger = require('./utils/logger');
const { loadConfig } = require('./utils/config');
const commands = require('./commands');

// Set up CLI
program
  .name('dependency-guardian')
  .description('A powerful dependency management and analysis tool')
  .version(require('../package.json').version);

// Load configuration
let config;
try {
  config = loadConfig();
  logger.debug('Configuration loaded:', config);
} catch (error) {
  logger.warn('Failed to load configuration:', error.message);
  config = {};
}

// Register commands
Object.entries(commands).forEach(([name, command]) => {
  command(program, config);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 