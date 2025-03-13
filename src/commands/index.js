const scanCommand = require('./scan');
const analyzeCommand = require('./analyze');
const ciCommand = require('./ci');
const interactiveCommand = require('./interactive');

module.exports = [
  scanCommand,
  analyzeCommand,
  ciCommand,
  interactiveCommand
]; 