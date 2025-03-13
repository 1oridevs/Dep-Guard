const analyzeCommand = require('./analyze');
const scanCommand = require('./scan');
const ciCommand = require('./ci');
const interactiveCommand = require('./interactive');

module.exports = [
  analyzeCommand,
  scanCommand,
  ciCommand,
  interactiveCommand
]; 