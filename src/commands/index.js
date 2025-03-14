const analyzeCommand = require('./analyze');
const scanCommand = require('./scan');
const ciCommand = require('./ci');
const interactiveCommand = require('./interactive');
const fixCommand = require('./fix');
const treeCommand = require('./tree');

module.exports = [
  analyzeCommand,
  scanCommand,
  ciCommand,
  interactiveCommand,
  fixCommand,
  treeCommand
]; 