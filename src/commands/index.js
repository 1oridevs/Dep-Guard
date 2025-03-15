const analyzeCommand = require('./analyze');
const scanCommand = require('./scan');
const ciCommand = require('./ci');
const interactiveCommand = require('./interactive');
const fixCommand = require('./fix');
const treeCommand = require('./tree');
const auditCommand = require('./audit');
const initCommand = require('./init');
const reportCommand = require('./report');
const policyCommand = require('./policy');
const cleanupCommand = require('./cleanup');
const licenseCommand = require('./license');
const performanceCommand = require('./performance');
const teamCommand = require('./team');
const bundleCommand = require('./bundle');
const impactCommand = require('./impact');
const optimizeCommand = require('./optimize');
const testCommand = require('./test');

// Make sure each command is properly initialized before exporting
const commands = [
  analyzeCommand,
  scanCommand,
  ciCommand,
  interactiveCommand,
  fixCommand,
  treeCommand,
  auditCommand,
  initCommand,
  reportCommand,
  policyCommand,
  cleanupCommand,
  licenseCommand,
  performanceCommand,
  teamCommand,
  bundleCommand,
  impactCommand,
  optimizeCommand,
  testCommand
].filter(Boolean); // Filter out any undefined commands

module.exports = commands; 