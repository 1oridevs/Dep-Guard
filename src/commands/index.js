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

module.exports = [
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
]; 