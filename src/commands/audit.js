const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs/promises');
const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');

const execPromise = util.promisify(exec);

const auditCommand = new Command('audit');

auditCommand
  .description('Audit project dependencies for security vulnerabilities')
  .option('-l, --level <level>', 'Minimum severity level to display (low, moderate, high, critical)', 'low')
  .option('-f, --fix', 'Attempt to fix vulnerabilities')
  .option('-r, --report <path>', 'Save report to file')
  .action(async options => {
    try {
      const results = await runAudit(options);
      displayResults(results, options.level);

      if (options.fix) {
        await fixVulnerabilities(results);
      }

      if (options.report) {
        await saveReport(results, options.report);
      }
    } catch (error) {
      logger.error('Audit error:', error);
    }
  });

async function runAudit(options) {
  const severityLevels = ['low', 'moderate', 'high', 'critical'];
  const minSeverityIndex = severityLevels.indexOf(options.level);

  try {
    // Run npm audit
    const { stdout } = await execPromise('npm audit --json');
    const npmAudit = JSON.parse(stdout);

    // Run Snyk audit for additional security checks
    const { stdout: snykOutput } = await execPromise('npx snyk test --json');
    const snykAudit = JSON.parse(snykOutput);

    // Combine and process results
    return processAuditResults(npmAudit, snykAudit, minSeverityIndex);
  } catch (error) {
    // Handle case where command fails but returns valid JSON
    if (error.stdout) {
      try {
        const npmAudit = JSON.parse(error.stdout);
        return processAuditResults(npmAudit, {}, minSeverityIndex);
      } catch (e) {
        throw error;
      }
    }
    throw error;
  }
}

function processAuditResults(npmResults, snykResults, minSeverityIndex) {
  const severityLevels = ['low', 'moderate', 'high', 'critical'];
  const results = {
    vulnerabilities: [],
    summary: {
      total: 0,
      bySeverity: {}
    }
  };

  // Process npm audit results
  Object.entries(npmResults.vulnerabilities || {}).forEach(([name, vuln]) => {
    const severityIndex = severityLevels.indexOf(vuln.severity);
    if (severityIndex >= minSeverityIndex) {
      results.vulnerabilities.push({
        package: name,
        severity: vuln.severity,
        description: vuln.title,
        fixAvailable: vuln.fixAvailable,
        path: vuln.path,
        range: vuln.range,
        source: 'npm'
      });
    }
  });

  // Process Snyk results
  (snykResults.vulnerabilities || []).forEach(vuln => {
    const severity = vuln.severity.toLowerCase();
    const severityIndex = severityLevels.indexOf(severity);
    if (severityIndex >= minSeverityIndex) {
      results.vulnerabilities.push({
        package: vuln.package,
        severity: severity,
        description: vuln.title,
        fixAvailable: Boolean(vuln.fixedIn),
        path: vuln.from.join(' > '),
        range: vuln.semver,
        source: 'snyk'
      });
    }
  });

  // Generate summary
  results.vulnerabilities.forEach(vuln => {
    results.summary.total++;
    results.summary.bySeverity[vuln.severity] = (results.summary.bySeverity[vuln.severity] || 0) + 1;
  });

  return results;
}

function displayResults(results, minLevel) {
  const severityColors = {
    critical: chalk.red.bold,
    high: chalk.red,
    moderate: chalk.yellow,
    low: chalk.gray
  };

  console.log('\nSecurity Audit Results:\n');

  // Display summary
  console.log(chalk.bold('Summary:'));
  console.log(`Total vulnerabilities: ${results.summary.total}`);
  Object.entries(results.summary.bySeverity).forEach(([severity, count]) => {
    const colorFn = severityColors[severity] || chalk.white;
    console.log(`${colorFn(`${severity}:`)} ${count}`);
  });

  // Display detailed vulnerabilities
  if (results.vulnerabilities.length > 0) {
    console.log('\nVulnerabilities:\n');
    results.vulnerabilities.forEach(vuln => {
      const colorFn = severityColors[vuln.severity] || chalk.white;
      console.log(colorFn(`${vuln.severity.toUpperCase()}: ${vuln.package}`));
      console.log(`  Description: ${vuln.description}`);
      console.log(`  Path: ${vuln.path}`);
      console.log(`  Fix available: ${vuln.fixAvailable ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  Source: ${vuln.source}`);
      console.log();
    });
  }
}

async function fixVulnerabilities(results) {
  const spinner = ora('Fixing vulnerabilities...').start();
  const fixes = [];

  try {
    // Try npm audit fix first
    await execPromise('npm audit fix');
    fixes.push('Applied npm audit fixes');

    // Run Snyk wizard for remaining issues
    await execPromise('npx snyk wizard');
    fixes.push('Applied Snyk fixes');

    spinner.succeed('Vulnerabilities fixed');
    fixes.forEach(fix => console.log(chalk.green(`✓ ${fix}`)));
  } catch (error) {
    spinner.fail('Some fixes could not be applied');
    logger.error('Fix error:', error);
  }
}

async function saveReport(results, filePath) {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      results: results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    console.log(chalk.green(`\n✓ Report saved to ${filePath}`));
  } catch (error) {
    logger.error('Failed to save report:', error);
  }
}

module.exports = auditCommand;