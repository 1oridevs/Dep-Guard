const ora = require('ora');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const dependencyAnalyzer = require('../core/analyzers/dependency-analyzer');
const bundleAnalyzer = require('../core/analyzers/bundle-analyzer');
const securityChecker = require('../core/checkers/security-checker');
const licenseChecker = require('../core/checkers/license-checker');

async function reportCommand(program) {
  program
    .command('report')
    .description('Generate comprehensive dependency reports')
    .option('-f, --format <type>', 'Output format (html|json|pdf|markdown)', 'html')
    .option('-o, --output <file>', 'Output file path')
    .option('--template <path>', 'Custom template path')
    .option('--include <items>', 'Items to include (security,license,updates,bundle)', 'all')
    .option('--compare <commit>', 'Compare with specific git commit')
    .action(async (options) => {
      const spinner = ora('Generating dependency report...').start();

      try {
        // Gather all data
        const data = await gatherReportData(options);
        
        // Generate report
        const report = await generateReport(data, options);
        
        // Save or display report
        await saveReport(report, options);
        
        spinner.succeed('Report generated successfully');
      } catch (error) {
        spinner.fail('Report generation failed');
        logger.error('Report error:', error);
        process.exit(1);
      }
    });
}

async function gatherReportData(options) {
  const data = {
    metadata: {
      timestamp: new Date().toISOString(),
      project: path.basename(process.cwd()),
      nodeVersion: process.version
    },
    sections: {}
  };

  // Dependencies overview
  const dependencies = await dependencyAnalyzer.analyze();
  data.sections.dependencies = {
    total: dependencies.length,
    direct: dependencies.filter(d => !d.isDev).length,
    dev: dependencies.filter(d => d.isDev).length,
    outdated: dependencies.filter(d => d.isOutdated).length
  };

  // Security analysis
  const security = await securityChecker.check();
  data.sections.security = {
    vulnerabilities: security.vulnerabilities,
    summary: security.summary
  };

  // License compliance
  const licenses = await licenseChecker.check();
  data.sections.licenses = {
    compliant: licenses.compliant,
    violations: licenses.violations,
    unknown: licenses.unknown
  };

  // Bundle analysis
  const bundle = await bundleAnalyzer.analyzeBundleSize();
  data.sections.bundle = {
    totalSize: bundle.totalSize,
    gzipSize: bundle.gzipSize,
    largestDependencies: bundle.largest
  };

  return data;
}

async function generateReport(data, options) {
  const format = options.format.toLowerCase();
  const template = options.template ? 
    await fs.readFile(options.template, 'utf8') : 
    getDefaultTemplate(format);

  switch (format) {
    case 'html':
      return generateHtmlReport(data, template);
    case 'markdown':
      return generateMarkdownReport(data, template);
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'pdf':
      return generatePdfReport(data, template);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

async function saveReport(report, options) {
  const defaultFilename = `dependency-report.${options.format}`;
  const outputPath = options.output || defaultFilename;

  await fs.writeFile(outputPath, report);
  console.log(chalk.green(`\n✓ Report saved to ${outputPath}`));

  // If it's HTML, also create assets
  if (options.format === 'html') {
    await createReportAssets(path.dirname(outputPath));
  }
}

function getDefaultTemplate(format) {
  switch (format) {
    case 'html':
      return `
<!DOCTYPE html>
<html>
<head>
  <title>Dependency Report</title>
  <link rel="stylesheet" href="report.css">
</head>
<body>
  <div class="report">
    <h1>Dependency Analysis Report</h1>
    <div class="metadata">
      <p>Generated: {{timestamp}}</p>
      <p>Project: {{project}}</p>
    </div>
    {{content}}
  </div>
  <script src="report.js"></script>
</body>
</html>`;
    case 'markdown':
      return `# Dependency Analysis Report

Generated: {{timestamp}}
Project: {{project}}

{{content}}`;
    default:
      return '';
  }
}

async function generateHtmlReport(data, template) {
  const sections = [];
  
  // Dependencies section
  sections.push(`
    <section class="dependencies">
      <h2>Dependencies Overview</h2>
      <div class="stats">
        <div class="stat">
          <span class="value">${data.sections.dependencies.total}</span>
          <span class="label">Total Dependencies</span>
        </div>
        <div class="stat">
          <span class="value">${data.sections.dependencies.outdated}</span>
          <span class="label">Outdated</span>
        </div>
      </div>
    </section>
  `);

  // Security section
  if (data.sections.security.vulnerabilities.length > 0) {
    sections.push(`
      <section class="security warning">
        <h2>Security Vulnerabilities</h2>
        <ul class="vulnerabilities">
          ${data.sections.security.vulnerabilities.map(v => `
            <li class="vulnerability ${v.severity}">
              <span class="package">${v.package}</span>
              <span class="severity">${v.severity}</span>
              <p class="description">${v.description}</p>
            </li>
          `).join('')}
        </ul>
      </section>
    `);
  }

  // Replace template variables
  let html = template
    .replace('{{timestamp}}', data.metadata.timestamp)
    .replace('{{project}}', data.metadata.project)
    .replace('{{content}}', sections.join('\n'));

  return html;
}

async function generateMarkdownReport(data, template) {
  const sections = [];
  
  // Dependencies section
  sections.push(`
## Dependencies Overview

- Total Dependencies: ${data.sections.dependencies.total}
- Direct Dependencies: ${data.sections.dependencies.direct}
- Dev Dependencies: ${data.sections.dependencies.dev}
- Outdated: ${data.sections.dependencies.outdated}
  `);

  // Security section
  if (data.sections.security.vulnerabilities.length > 0) {
    sections.push(`
## Security Vulnerabilities

${data.sections.security.vulnerabilities.map(v => `
### ${v.package} (${v.severity})
- Description: ${v.description}
- Fix available: ${v.fixAvailable ? 'Yes' : 'No'}
`).join('\n')}
    `);
  }

  // Replace template variables
  let markdown = template
    .replace('{{timestamp}}', data.metadata.timestamp)
    .replace('{{project}}', data.metadata.project)
    .replace('{{content}}', sections.join('\n'));

  return markdown;
}

async function generatePdfReport(data, template) {
  // First generate HTML
  const html = await generateHtmlReport(data, template);
  
  // Convert to PDF using puppeteer
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  
  return pdf;
}

async function createReportAssets(outputDir) {
  // Create CSS
  const css = `
    .report { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stat { padding: 1rem; border-radius: 8px; background: #f5f5f5; }
    .vulnerability { margin: 1rem 0; padding: 1rem; border-radius: 4px; }
    .vulnerability.critical { background: #fee; }
    .vulnerability.high { background: #fff3e0; }
  `;
  
  await fs.writeFile(path.join(outputDir, 'report.css'), css);

  // Create JavaScript
  const js = `
    document.addEventListener('DOMContentLoaded', function() {
      // Add interactivity here
    });
  `;
  
  await fs.writeFile(path.join(outputDir, 'report.js'), js);
}

module.exports = reportCommand; 