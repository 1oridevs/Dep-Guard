const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class ReportManager {
  constructor() {
    this.historyFile = path.join(process.cwd(), 'reports', 'history.json');
  }

  async saveScanResults(results) {
    try {
      await fs.mkdir(path.dirname(this.historyFile), { recursive: true });
      
      let history = { scans: [] };
      try {
        const content = await fs.readFile(this.historyFile, 'utf8');
        history = JSON.parse(content);
      } catch (error) {
        // File doesn't exist yet, use default empty history
      }

      history.scans.push({
        timestamp: new Date().toISOString(),
        results
      });

      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      logger.error('Failed to save scan results:', error);
    }
  }

  async generateReport(results, template = 'default', compareWith = null) {
    // Implementation moved from index.js
    const templates = {
      default: this.generateDefaultReport,
      // Add more templates as needed
    };

    const generator = templates[template] || templates.default;
    return generator(results, compareWith);
  }

  generateDefaultReport(results, compareWith) {
    // Implementation moved from index.js
    // Format results into a readable report
    return `# Dependency Analysis Report\n\n${JSON.stringify(results, null, 2)}`;
  }
}

module.exports = new ReportManager(); 