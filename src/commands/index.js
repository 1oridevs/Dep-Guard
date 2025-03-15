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
  policyCommand
].filter(Boolean); // Filter out any undefined commands

module.exports = commands; 