const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const { convertToHTML, convertToCSV, convertToJUnit } = require('../../utils/formatters');

class ReportManager {
  constructor() {
    this.reports = new Map();
  }

  async generateReport(data, format = 'json', options = {}) {
    try {
      let report;
      switch (format.toLowerCase()) {
        case 'html':
          report = this.generateHTMLReport(data, options);
          break;
        case 'csv':
          report = this.generateCSVReport(data, options);
          break;
        case 'junit':
          report = this.generateJUnitReport(data, options);
          break;
        case 'json':
        default:
          report = this.generateJSONReport(data, options);
      }

      if (options.output) {
        await this.saveReport(report, options.output);
      }

      return report;
    } catch (error) {
      logger.error('Failed to generate report:', error);
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  generateJSONReport(data, options = {}) {
    return JSON.stringify(data, null, 2);
  }

  generateHTMLReport(data, options = {}) {
    const template = options.template || 'default';
    const content = convertToHTML(data);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dependency Guardian Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            .high { color: red; }
            .moderate { color: orange; }
            .low { color: yellow; }
          </style>
        </head>
        <body>
          <h1>Dependency Guardian Report</h1>
          <p>Generated on: ${new Date().toISOString()}</p>
          ${content}
        </body>
      </html>
    `;
  }

  generateCSVReport(data, options = {}) {
    return convertToCSV(data);
  }

  generateJUnitReport(data, options = {}) {
    return convertToJUnit(data);
  }

  async saveReport(content, outputPath) {
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, content, 'utf8');
      logger.debug(`Report saved to ${outputPath}`);
    } catch (error) {
      logger.error('Failed to save report:', error);
      throw new Error(`Failed to save report: ${error.message}`);
    }
  }
}

module.exports = new ReportManager(); 