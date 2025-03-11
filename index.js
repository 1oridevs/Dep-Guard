#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const semver = require('semver');
const execPromise = util.promisify(exec);
const program = new Command();
const { cosmiconfig } = require('cosmiconfig');
const dependencyTree = require('dependency-tree');
const madge = require('madge');
const yaml = require('js-yaml');
const glob = require('glob');
const fsSync = require('fs');
const ora = require('ora');
const cliProgress = require('cli-progress');
const pLimit = require('p-limit');
const NodeCache = require('node-cache');
const inquirer = require('inquirer');

const registryCache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 120
});

// Add these variables at the top of the file
let cacheHits = 0;
let cacheMisses = 0;

// Ensure policies directory exists
if (!fsSync.existsSync('policies')) {
  fsSync.mkdirSync('policies');
}

const defaultPolicy = {
  name: "New Policy",
  version: "1.0.0",
  description: "A new dependency management policy",
  extends: [],
  rules: {
    licenses: {
      allowed: ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause"],
      forbidden: ["GPL", "AGPL"],
      unknown: "warn"
    },
    security: {
      maxSeverity: "moderate",
      autofix: false,
      exceptions: []
    },
    versioning: {
      maxAge: "6 months",
      allowMajorUpdates: false,
      autoMerge: {
        patch: true,
        minor: false,
        major: false
      }
    },
    dependencies: {
      maxDirect: 150,
      maxDepth: 10,
      bannedPackages: [],
      requiredPackages: [],
      duplicatesAllowed: false
    }
  },
  notifications: {
    slack: false,
    email: false,
    githubIssues: true
  },
  documentation: {
    required: true,
    template: "default"
  }
};

function deepMerge(target, source) {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  
  const output = { ...target };
  
  Object.keys(source).forEach(key => {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!(key in target)) {
        output[key] = source[key];
      } else {
        output[key] = deepMerge(target[key], source[key]);
      }
    } else {
      output[key] = source[key];
    }
  });
  
  return output;
}

program
  .name('dependency-guardian')
  .description('A CLI tool to scan Node.js project dependencies for outdated packages, license compliance, and vulnerabilities')
  .version('1.0.0');

function displayWelcome() {
  console.log(chalk.blue.bold('\n🛡️  Welcome to Dependency Guardian 🛡️\n'));
}

async function readPackageJson(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const data = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(data);
}

async function getPackageInfo(packageName) {
  const cacheKey = `pkg:${packageName}`;
  const cached = registryCache.get(cacheKey);
  if (cached) {
    cacheHits++;
    return cached;
  }

  cacheMisses++;
  try {
    const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
    const latestVersion = response.data['dist-tags'].latest;
    const license = response.data.versions[latestVersion].license || 'Unknown';
    const versions = Object.keys(response.data.versions);
    
    const result = { 
      latestVersion, 
      license,
      versions: versions.filter(v => semver.valid(v)).sort(semver.rcompare)
    };

    registryCache.set(cacheKey, result);
    return result;
  } catch (error) {
    return { 
      latestVersion: null, 
      license: 'Unknown',
      versions: []
    };
  }
}

async function getVulnerabilities(projectPath) {
  try {
    const { stdout } = await execPromise('npm audit --json', { cwd: projectPath });
    const auditData = JSON.parse(stdout);
    return auditData.vulnerabilities || {};
  } catch (error) {
    if (error.stdout) {
      return JSON.parse(error.stdout).vulnerabilities || {};
    }
    return {};
  }
}

function getSeverityLevel(vulnerabilities) {
  if (!vulnerabilities) return { level: 'NONE', count: 0 };
  
  const severityLevels = ['critical', 'high', 'moderate', 'low'];
  let totalVulnerabilities = 0;
  
  for (const level of severityLevels) {
    if (vulnerabilities[level]) {
      totalVulnerabilities += vulnerabilities[level];
      return { level: level.toUpperCase(), count: totalVulnerabilities };
    }
  }
  
  return { level: 'NONE', count: 0 };
}

function analyzeVersionChange(current, latest, allVersions) {
  if (!latest || !current) return { type: 'ERROR', suggestedUpdate: null };
  
  const cleanCurrent = current.replace(/[\^~]/, '');
  if (!semver.valid(cleanCurrent) || !semver.valid(latest)) {
    return { type: 'ERROR', suggestedUpdate: null };
  }

  if (semver.eq(cleanCurrent, latest)) {
    return { type: 'UP-TO-DATE', suggestedUpdate: null };
  }

  const diff = semver.diff(cleanCurrent, latest);
  const safeUpdate = allVersions.find(v => 
    semver.gt(v, cleanCurrent) && 
    semver.patch(v) > semver.patch(cleanCurrent) &&
    semver.major(v) === semver.major(cleanCurrent) &&
    semver.minor(v) === semver.minor(cleanCurrent)
  );

  const minorUpdate = allVersions.find(v =>
    semver.gt(v, cleanCurrent) &&
    semver.major(v) === semver.major(cleanCurrent)
  );

  return {
    type: diff,
    suggestedUpdate: safeUpdate || minorUpdate || latest
  };
}

function checkLicenseCompliance(license, allowedLicenses = []) {
  if (!license || license === 'Unknown') return 'UNKNOWN';
  return allowedLicenses.includes(license) ? 'COMPLIANT' : 'NON-COMPLIANT';
}

async function scanDependencies(dependencies, type = 'dependencies', allowedLicenses, vulnerabilities, rules) {
  if (!Array.isArray(allowedLicenses)) {
    console.warn(chalk.yellow('Warning: allowedLicenses is not an array, using empty array'));
    allowedLicenses = [];
  }

  const results = [];
  const limit = pLimit(5);
  const spinner = ora('Scanning dependencies...').start();
  const progressBar = new cliProgress.SingleBar({
    format: 'Scanning |{bar}| {percentage}% | {value}/{total} packages',
    barCompleteChar: '=',
    barIncompleteChar: '-'
  });

  try {
    const total = Object.keys(dependencies).length;
    progressBar.start(total, 0);
    
    const packageNames = Object.keys(dependencies);
    const batchResults = await getBatchPackageInfo(packageNames);

    const promises = packageNames.map((name, index) => 
      limit(async () => {
        const { latestVersion, license, versions } = batchResults[index];
        const { type: versionStatus, suggestedUpdate } = analyzeVersionChange(dependencies[name], latestVersion, versions);
        const licenseStatus = checkLicenseCompliance(license, allowedLicenses);
        const { level: vulnLevel, count: vulnCount } = getSeverityLevel(vulnerabilities[name]);
        
        progressBar.increment();
        
        return {
          name,
          type,
          currentVersion: dependencies[name],
          latestVersion: latestVersion || 'Unknown',
          suggestedUpdate,
          license,
          versionStatus,
          licenseStatus,
          vulnLevel,
          vulnCount
        };
      })
    );

    const scannedResults = await Promise.all(promises);
    results.push(...scannedResults);
  } finally {
    spinner.stop();
    progressBar.stop();
  }
  
  return results;
}

function displayResults(results) {
  if (!results || results.length === 0) {
    console.log(chalk.yellow('\nNo dependencies found.'));
    return;
  }

  console.log('\nDependency Scan Results:\n');
  
  // Group by type (dependencies/devDependencies)
  const grouped = results.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {});

  // Display each group
  for (const [type, deps] of Object.entries(grouped)) {
    console.log(chalk.bold(`\n${type}:`));
    
    deps.forEach(dep => {
      const nameColor = dep.vulnLevel === 'NONE' ? 'white' : 'red';
      console.log(
        chalk[nameColor](`\n${dep.name}`) +
        chalk.dim(` (${dep.currentVersion} → ${dep.latestVersion})`)
      );

      // Version status
      const statusColor = {
        'UP-TO-DATE': 'green',
        'patch': 'yellow',
        'minor': 'yellow',
        'major': 'red',
        'ERROR': 'red'
      }[dep.versionStatus] || 'white';

      console.log(
        chalk.dim('Status: ') +
        chalk[statusColor](dep.versionStatus) +
        (dep.suggestedUpdate ? chalk.dim(` (suggested: ${dep.suggestedUpdate})`) : '')
      );

      // License status
      const licenseColor = {
        'COMPLIANT': 'green',
        'NON-COMPLIANT': 'red',
        'UNKNOWN': 'yellow'
      }[dep.licenseStatus];

      console.log(
        chalk.dim('License: ') +
        chalk[licenseColor](`${dep.license} (${dep.licenseStatus})`)
      );

      // Vulnerabilities
      if (dep.vulnLevel !== 'NONE') {
        console.log(
          chalk.dim('Vulnerabilities: ') +
          chalk.red(`${dep.vulnCount} (${dep.vulnLevel})`)
        );
      }
    });
  }

  // Print summary
  const summary = results.reduce((acc, dep) => {
    // Count by version status
    if (!acc.versions[dep.versionStatus]) {
      acc.versions[dep.versionStatus] = 0;
    }
    acc.versions[dep.versionStatus]++;

    // Count by license status
    if (!acc.licenses[dep.licenseStatus]) {
      acc.licenses[dep.licenseStatus] = 0;
    }
    acc.licenses[dep.licenseStatus]++;

    // Count vulnerabilities
    if (!acc.vulnerabilities[dep.vulnLevel]) {
      acc.vulnerabilities[dep.vulnLevel] = 0;
    }
    acc.vulnerabilities[dep.vulnLevel]++;

    return acc;
  }, { versions: {}, licenses: {}, vulnerabilities: {} });

  console.log(chalk.bold('\nSummary:'));
  
  console.log(chalk.dim('\nVersion Status:'));
  Object.entries(summary.versions).forEach(([status, count]) => {
    const color = {
      'UP-TO-DATE': 'green',
      'patch': 'yellow',
      'minor': 'yellow',
      'major': 'red',
      'ERROR': 'red'
    }[status] || 'white';
    console.log(chalk[color](`${status}: ${count}`));
  });

  console.log(chalk.dim('\nLicense Compliance:'));
  Object.entries(summary.licenses).forEach(([status, count]) => {
    const color = {
      'COMPLIANT': 'green',
      'NON-COMPLIANT': 'red',
      'UNKNOWN': 'yellow'
    }[status] || 'white';
    console.log(chalk[color](`${status}: ${count}`));
  });

  console.log(chalk.dim('\nVulnerabilities:'));
  Object.entries(summary.vulnerabilities)
    .filter(([level]) => level !== 'NONE')
    .forEach(([level, count]) => {
      console.log(chalk.red(`${level}: ${count}`));
    });
}

function displaySummary(results) {
  const summary = results.reduce((acc, { versionStatus, licenseStatus, vulnLevel }) => {
    if (['major', 'minor', 'patch'].includes(versionStatus)) {
      acc.versions[versionStatus] = (acc.versions[versionStatus] || 0) + 1;
    } else {
      acc.versions[versionStatus] = (acc.versions[versionStatus] || 0) + 1;
    }
    acc.licenses[licenseStatus] = (acc.licenses[licenseStatus] || 0) + 1;
    acc.vulnerabilities[vulnLevel] = (acc.vulnerabilities[vulnLevel] || 0) + 1;
    return acc;
  }, { versions: {}, licenses: {}, vulnerabilities: {} });

  console.log(chalk.bold('\nSummary:'));
  console.log('----------------------------------------');
  
  console.log(chalk.bold('\nVersion Status:'));
  console.log(`✅ Up-to-date: ${chalk.green(summary.versions['UP-TO-DATE'] || 0)}`);
  console.log(`🔴 Major updates: ${chalk.red(summary.versions['major'] || 0)}`);
  console.log(`🟡 Minor updates: ${chalk.yellow(summary.versions['minor'] || 0)}`);
  console.log(`🔵 Patch updates: ${chalk.blue(summary.versions['patch'] || 0)}`);
  console.log(`❌ Errors: ${chalk.red(summary.versions['ERROR'] || 0)}`);
  
  console.log(chalk.bold('\nLicense Status:'));
  console.log(`✅ Compliant: ${chalk.green(summary.licenses['COMPLIANT'] || 0)}`);
  console.log(`❌ Non-compliant: ${chalk.red(summary.licenses['NON-COMPLIANT'] || 0)}`);
  console.log(`⚠️  Unknown: ${chalk.yellow(summary.licenses['UNKNOWN'] || 0)}`);
  
  console.log(chalk.bold('\nSecurity Status:'));
  console.log(`✅ No vulnerabilities: ${chalk.green(summary.vulnerabilities['NONE'] || 0)}`);
  console.log(`ℹ️  Low severity: ${chalk.blue(summary.vulnerabilities['LOW'] || 0)}`);
  console.log(`⚠️  Moderate severity: ${chalk.yellow(summary.vulnerabilities['MODERATE'] || 0)}`);
  console.log(`❌ High severity: ${chalk.red(summary.vulnerabilities['HIGH'] || 0)}`);
  console.log(`💀 Critical severity: ${chalk.redBright(summary.vulnerabilities['CRITICAL'] || 0)}`);
  
  console.log(`\n📦 Total packages scanned: ${chalk.blue(results.length)}`);
  console.log('----------------------------------------\n');
}

const reportTemplates = {
  default: {
    name: 'Default Template',
    format: 'markdown',
    sections: ['summary', 'dependencies', 'security', 'licenses'],
    template: `
# Dependency Guardian Report
Generated on: {{date}}

## Summary
{{summary}}

## Dependencies
{{dependencies}}

## Security Analysis
{{security}}

## License Compliance
{{licenses}}
    `
  },
  minimal: {
    name: 'Minimal Report',
    format: 'markdown',
    sections: ['summary'],
    template: `
# Dependency Report Summary
Generated on: {{date}}

{{summary}}
    `
  },
  detailed: {
    name: 'Detailed Report',
    format: 'markdown',
    sections: ['summary', 'dependencies', 'security', 'licenses', 'updates', 'trends'],
    template: `
# Detailed Dependency Analysis
Generated on: {{date}}

## Executive Summary
{{summary}}

## Dependencies Overview
{{dependencies}}

## Security Analysis
{{security}}

## License Compliance
{{licenses}}

## Available Updates
{{updates}}

## Historical Trends
{{trends}}
    `
  }
};

class ReportManager {
  constructor() {
    this.historyFile = '.depguard/history.json';
    this.ensureHistoryFile();
  }

  async ensureHistoryFile() {
    try {
      await fs.mkdir(path.dirname(this.historyFile), { recursive: true });
      if (!fsSync.existsSync(this.historyFile)) {
        await fs.writeFile(this.historyFile, JSON.stringify({ scans: [] }));
      }
    } catch (error) {
      console.error('Error creating history file:', error);
    }
  }

  async saveScanResults(results) {
    try {
      const history = JSON.parse(await fs.readFile(this.historyFile, 'utf8'));
      history.scans.push({
      timestamp: new Date().toISOString(),
        results: results
      });
      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Error saving scan results:', error);
    }
  }

  async generateReport(results, template = 'default', compareWith = null) {
    const reportTemplate = reportTemplates[template] || reportTemplates.default;
    let report = reportTemplate.template;

    // Replace template variables
    report = report.replace('{{date}}', new Date().toLocaleString());
    
    // Generate sections
    for (const section of reportTemplate.sections) {
      const content = await this.generateSection(section, results, compareWith);
      report = report.replace(`{{${section}}}`, content);
    }

    return report;
  }

  async generateSection(section, results, compareWith) {
    switch (section) {
      case 'summary':
        return this.generateSummarySection(results, compareWith);
      case 'dependencies':
        return this.generateDependenciesSection(results);
      case 'security':
        return this.generateSecuritySection(results);
      case 'licenses':
        return this.generateLicensesSection(results);
      case 'updates':
        return this.generateUpdatesSection(results);
      case 'trends':
        return this.generateTrendsSection(results);
      default:
        return '';
    }
  }

  async generateSummarySection(results, compareWith) {
    let summary = '### Overview\n';
    summary += `- Total packages: ${results.length}\n`;
    
    const stats = this.calculateStats(results);
    summary += `- Up-to-date packages: ${stats.upToDate}\n`;
    summary += `- Outdated packages: ${stats.outdated}\n`;
    summary += `- Security issues: ${stats.securityIssues}\n`;
    summary += `- License issues: ${stats.licenseIssues}\n`;

    if (compareWith) {
      summary += '\n### Changes Since Last Scan\n';
      const changes = this.compareResults(results, compareWith);
      summary += `- New packages: ${changes.added.length}\n`;
      summary += `- Removed packages: ${changes.removed.length}\n`;
      summary += `- Updated packages: ${changes.updated.length}\n`;
    }

    return summary;
  }

  calculateStats(results) {
    return results.reduce((stats, dep) => ({
      upToDate: stats.upToDate + (dep.versionStatus === 'UP-TO-DATE' ? 1 : 0),
      outdated: stats.outdated + (dep.versionStatus !== 'UP-TO-DATE' ? 1 : 0),
      securityIssues: stats.securityIssues + (dep.vulnCount > 0 ? 1 : 0),
      licenseIssues: stats.licenseIssues + (dep.licenseStatus === 'NON-COMPLIANT' ? 1 : 0)
    }), { upToDate: 0, outdated: 0, securityIssues: 0, licenseIssues: 0 });
  }

  compareResults(current, previous) {
    const currentPackages = new Set(current.map(r => r.name));
    const previousPackages = new Set(previous.map(r => r.name));

    return {
      added: [...currentPackages].filter(p => !previousPackages.has(p)),
      removed: [...previousPackages].filter(p => !currentPackages.has(p)),
      updated: current.filter(c => {
        const prev = previous.find(p => p.name === c.name);
        return prev && prev.currentVersion !== c.currentVersion;
      })
    };
  }

  async generateTrendsSection(results) {
    try {
      const history = JSON.parse(await fs.readFile(this.historyFile, 'utf8'));
      const trends = this.analyzeTrends(history.scans);
      
      let section = '### Historical Trends\n\n';
      section += '#### Dependency Count\n';
      section += `- Current: ${results.length}\n`;
      section += `- Average: ${trends.averageDepCount.toFixed(1)}\n`;
      section += `- Trend: ${trends.depCountTrend}\n\n`;

      section += '#### Security Issues\n';
      section += `- Current: ${trends.currentSecurityIssues}\n`;
      section += `- Trend: ${trends.securityTrend}\n\n`;

      section += '#### License Compliance\n';
      section += `- Current compliance rate: ${trends.currentLicenseCompliance}%\n`;
      section += `- Trend: ${trends.licenseTrend}\n`;

      return section;
  } catch (error) {
      return '### Historical Trends\nNo historical data available.';
    }
  }

  analyzeTrends(scans) {
    if (scans.length < 2) return null;

    const depCounts = scans.map(s => s.results.length);
    const securityIssues = scans.map(s => 
      s.results.reduce((sum, r) => sum + r.vulnCount, 0)
    );
    const licenseCompliance = scans.map(s =>
      (s.results.filter(r => r.licenseStatus === 'COMPLIANT').length / s.results.length) * 100
    );
    
    return {
      averageDepCount: depCounts.reduce((a, b) => a + b) / depCounts.length,
      depCountTrend: this.calculateTrend(depCounts),
      currentSecurityIssues: securityIssues[securityIssues.length - 1],
      securityTrend: this.calculateTrend(securityIssues),
      currentLicenseCompliance: licenseCompliance[licenseCompliance.length - 1].toFixed(1),
      licenseTrend: this.calculateTrend(licenseCompliance)
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 'Not enough data';
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const diff = ((last - prev) / prev) * 100;
    
    if (Math.abs(diff) < 1) return 'Stable';
    return `${diff > 0 ? 'Increased' : 'Decreased'} by ${Math.abs(diff).toFixed(1)}%`;
  }

  async generateDependenciesSection(results) {
    let section = '### Dependencies Overview\n\n';
    
    // Group by type
    const deps = results.filter(r => r.type === 'dependencies');
    const devDeps = results.filter(r => r.type === 'devDependencies');
    
    section += '#### Production Dependencies\n';
    section += this.formatDependencyList(deps);
    
    section += '\n#### Development Dependencies\n';
    section += this.formatDependencyList(devDeps);
    
    return section;
  }

  async generateSecuritySection(results) {
    let section = '### Security Analysis\n\n';
    
    const vulnerabilities = results.filter(r => r.vulnCount > 0)
      .sort((a, b) => b.vulnCount - a.vulnCount);
    
    if (vulnerabilities.length === 0) {
      section += '✅ No security vulnerabilities found\n';
    } else {
      section += `⚠️ Found ${vulnerabilities.length} packages with vulnerabilities:\n\n`;
      vulnerabilities.forEach(pkg => {
        section += `- ${pkg.name} (${pkg.vulnCount} ${pkg.vulnLevel} vulnerabilities)\n`;
      });
    }
    
    return section;
  }

  async generateLicensesSection(results) {
    let section = '### License Compliance\n\n';
    
    const nonCompliant = results.filter(r => r.licenseStatus === 'NON-COMPLIANT');
    const unknown = results.filter(r => r.licenseStatus === 'UNKNOWN');
    
    if (nonCompliant.length === 0 && unknown.length === 0) {
      section += '✅ All licenses are compliant\n';
    } else {
      if (nonCompliant.length > 0) {
        section += `⚠️ Found ${nonCompliant.length} non-compliant licenses:\n\n`;
        nonCompliant.forEach(pkg => {
          section += `- ${pkg.name} (${pkg.license})\n`;
        });
      }
      
      if (unknown.length > 0) {
        section += `\n⚠️ Found ${unknown.length} packages with unknown licenses:\n\n`;
        unknown.forEach(pkg => {
          section += `- ${pkg.name}\n`;
        });
      }
    }
    
    return section;
  }

  async generateUpdatesSection(results) {
    let section = '### Available Updates\n\n';
    
    const updates = results.filter(r => r.versionStatus !== 'UP-TO-DATE')
      .sort((a, b) => {
        const order = { major: 3, minor: 2, patch: 1 };
        return order[b.versionStatus] - order[a.versionStatus];
      });
    
    if (updates.length === 0) {
      section += '✅ All packages are up to date\n';
    } else {
      section += `Found ${updates.length} packages with available updates:\n\n`;
      
      const byType = {
        major: updates.filter(r => r.versionStatus === 'major'),
        minor: updates.filter(r => r.versionStatus === 'minor'),
        patch: updates.filter(r => r.versionStatus === 'patch')
      };
      
      if (byType.major.length > 0) {
        section += '#### Major Updates (Breaking Changes)\n';
        byType.major.forEach(pkg => {
          section += `- ${pkg.name}: ${pkg.currentVersion} → ${pkg.latestVersion}\n`;
        });
      }
      
      if (byType.minor.length > 0) {
        section += '\n#### Minor Updates (New Features)\n';
        byType.minor.forEach(pkg => {
          section += `- ${pkg.name}: ${pkg.currentVersion} → ${pkg.latestVersion}\n`;
        });
      }
      
      if (byType.patch.length > 0) {
        section += '\n#### Patch Updates (Bug Fixes)\n';
        byType.patch.forEach(pkg => {
          section += `- ${pkg.name}: ${pkg.currentVersion} → ${pkg.latestVersion}\n`;
        });
      }
    }
    
    return section;
  }

  formatDependencyList(deps) {
    if (deps.length === 0) return 'No dependencies found\n';
    
    return deps.map(dep => 
      `- ${dep.name} (${dep.currentVersion})\n  ` +
      `Status: ${dep.versionStatus}, ` +
      `License: ${dep.license}, ` +
      `Security: ${dep.vulnCount > 0 ? `${dep.vulnCount} ${dep.vulnLevel}` : 'Clean'}`
    ).join('\n');
  }
}

program
  .command('scan')
  .description('Scan project dependencies for issues')
  .option('-p, --path <path>', 'project path')
  .option('-i, --include-dev', 'include devDependencies')
  .option('-f, --format <format>', 'output format (console, json, csv)', 'console')
  .option('-o, --output <file>', 'output file path')
  .option('--filter-status <status>', 'Filter by update status (comma-separated: UP-TO-DATE,major,minor,patch)')
  .option('--filter-name <pattern>', 'Filter by package name pattern')
  .option('--filter-license <licenses>', 'Filter by license (comma-separated)')
  .option('--filter-severity <levels>', 'Filter by vulnerability severity (comma-separated: HIGH,CRITICAL,MODERATE,LOW)')
  .option('--deps-only', 'Show only dependencies')
  .option('--dev-deps-only', 'Show only devDependencies')
  .option('--sort <field>', 'Sort by field (name, version, license, severity)', 'name')
  .option('--reverse', 'Reverse sort order')
  .option('--max-size <bytes>', 'Filter by maximum package size in bytes')
  .option('--max-gzip <bytes>', 'Filter by maximum gzipped size in bytes')
  .option('--min-downloads <count>', 'Filter by minimum monthly downloads')
  .option('--last-update <days>', 'Filter by last update (in days)')
  .option('--max-depth <number>', 'Filter by maximum dependency depth')
  .option('--pattern <regex>', 'Filter by regex pattern')
  .option('--save-preset <name>', 'Save current filters as preset')
  .option('--load-preset <name>', 'Load saved filter preset')
  .action(async (options) => {
    try {
      // Load user preferences
      const prefs = await loadUserPreferences();
      currentTheme = options.theme || prefs.theme || 'default';
      verboseMode = options.verbose || prefs.verbose || false;

      // Load filter preset if specified
      if (options.loadPreset) {
        const preset = prefs.filterPresets?.[options.loadPreset];
        if (!preset) {
          throw new DependencyGuardianError(
            `Filter preset '${options.loadPreset}' not found`,
            'PRESET_NOT_FOUND',
            ['Check available presets with --list-presets', 'Create a new preset with --save-preset']
          );
        }
        options = { ...options, ...preset };
      }

      // Setup keyboard shortcuts for interactive mode
      if (!options.quiet && process.stdin.isTTY) {
        setupKeyboardShortcuts();
      }

      const results = await performFullScan({
        ...options,
        format: options.format,
        verbose: verboseMode
      });

      // Save filter preset if specified
      if (options.savePreset) {
        const filterOptions = {
          filterStatus: options.filterStatus,
          filterName: options.filterName,
          filterLicense: options.filterLicense,
          filterSeverity: options.filterSeverity,
          depsOnly: options.depsOnly,
          devDepsOnly: options.devDepsOnly,
          maxSize: options.maxSize,
          maxGzip: options.maxGzip,
          minDownloads: options.minDownloads,
          lastUpdate: options.lastUpdate,
          maxDepth: options.maxDepth,
          pattern: options.pattern
        };
        
        await saveUserPreferences({
          ...prefs,
          filterPresets: {
            ...prefs.filterPresets,
            [options.savePreset]: filterOptions
          }
        });
        
        console.log(themes[currentTheme].success(
          `Filter preset '${options.savePreset}' saved successfully`
        ));
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        displayResults(results);
      }
    } catch (error) {
      if (error instanceof DependencyGuardianError) {
        error.prettyPrint();
      } else {
        console.error(themes[currentTheme].error(`\nError: ${error.message}`));
        if (verboseMode) {
          console.error(themes[currentTheme].dim('\nStack trace:'));
          console.error(error.stack);
        }
      }
      process.exit(1);
    }
  });

program
  .command('policy')
  .description('Manage dependency policies')
  .option('-l, --list', 'List all available policies')
  .option('-v, --validate <policy>', 'Validate a policy file')
  .option('-d, --doc <policy>', 'Generate documentation for a policy')
  .option('-c, --create <name>', 'Create a new policy')
  .option('-i, --inherit <parent>', 'Parent policy to inherit from when creating')
  .action(async (options) => {
    try {
      const policyFiles = glob.sync('policies/**/*.{json,yaml,yml}');
      const policies = await loadPolicies(policyFiles);
      
      if (options.list) {
        console.log(chalk.bold('\nAvailable Policies:'));
        for (const [name, policy] of policies.entries()) {
          console.log(`\n${chalk.cyan(name)} (${policy.version})`);
          console.log(chalk.dim(policy.description || 'No description'));
          if (policy.extends?.length) {
            console.log(chalk.dim(`Extends: ${policy.extends.join(', ')}`));
          }
        }
        return;
      }
      
      if (options.validate) {
        const policy = policies.get(options.validate);
        if (!policy) {
          console.error(chalk.red(`Policy "${options.validate}" not found`));
          process.exit(1);
        }
        
        const { errors, warnings } = validatePolicy(policy);
        
        if (errors.length > 0) {
          console.log(chalk.red('\nValidation Errors:'));
          errors.forEach(error => console.log(chalk.red(`❌ ${error}`)));
        }
        
        if (warnings.length > 0) {
          console.log(chalk.yellow('\nValidation Warnings:'));
          warnings.forEach(warning => console.log(chalk.yellow(`⚠️  ${warning}`)));
        }
        
        if (errors.length === 0 && warnings.length === 0) {
          console.log(chalk.green('\n✅ Policy is valid'));
        }
        
        return;
      }
      
      if (options.doc) {
        const policy = policies.get(options.doc);
        if (!policy) {
          console.error(chalk.red(`Policy "${options.doc}" not found`));
          process.exit(1);
        }
        
        const documentation = await generatePolicyDocumentation(policy);
        const outputPath = `policies/docs/${policy.name}.md`;
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, documentation);
        
        console.log(chalk.green(`Documentation generated: ${outputPath}`));
        return;
      }
      
      if (options.create) {
        const template = options.inherit
          ? await deepMerge(defaultPolicy, policies.get(options.inherit))
          : defaultPolicy;
          
        const newPolicy = {
          ...template,
          name: options.create,
          version: '1.0.0',
          extends: options.inherit ? [options.inherit] : []
        };
        
        const outputPath = `policies/${options.create}.policy.json`;
        await fs.writeFile(
          outputPath,
          JSON.stringify(newPolicy, null, 2)
        );
        
        console.log(chalk.green(`Policy created: ${outputPath}`));
        return;
      }
      
      program.help();
    } catch (error) {
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('ci')
  .description('CI/CD integration utilities')
  .option('--init <type>', 'Initialize CI integration (github, gitlab, jenkins)', 'github')
  .option('--hooks', 'Install git hooks')
  .option('--check-only', 'Exit with error code on issues')
  .action(async (options) => {
    try {
      if (options.init) {
        await initializeCIIntegration(options.init);
      }
      
      if (options.hooks) {
        await installGitHooks();
      }
      
      if (options.checkOnly) {
        const { hasIssues, results, error } = await runCICheck();
        if (error) {
          console.error(chalk.red(`CI check failed: ${error}`));
          process.exit(1);
        }
        if (hasIssues) {
          console.error(chalk.red('Issues found during CI check'));
          displayResults(results);
          process.exit(1);
        }
        console.log(chalk.green('CI check passed'));
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('cache')
  .description('Manage package registry cache')
  .option('--clear', 'Clear the cache')
  .option('--stats', 'Show cache statistics')
  .action((options) => {
    if (options.clear) {
      registryCache.flushAll();
      console.log(chalk.green('Cache cleared successfully'));
      return;
    }
    
    if (options.stats) {
      const stats = registryCache.getStats();
      console.log(chalk.bold('\nCache Statistics:'));
      console.log(`Hits: ${chalk.green(stats.hits)}`);
      console.log(`Misses: ${chalk.yellow(stats.misses)}`);
      console.log(`Keys: ${chalk.blue(registryCache.keys().length)}`);
      return;
    }
    
    program.help();
  });

// First define the themes
const themes = {
  default: {
    info: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    critical: chalk.redBright,
    dim: chalk.dim,
    highlight: chalk.cyan,
    normal: chalk.white,
    title: chalk.blue.bold,
    border: 'blue'
  },
  dark: {
    info: chalk.blueBright,
    success: chalk.greenBright,
    warning: chalk.yellowBright,
    error: chalk.redBright,
    critical: chalk.bgRed.white,
    dim: chalk.gray,
    highlight: chalk.cyanBright,
    normal: chalk.whiteBright,
    title: chalk.cyanBright.bold,
    border: 'cyan'
  },
  light: {
    info: chalk.blue.dim,
    success: chalk.green.dim,
    warning: chalk.yellow.dim,
    error: chalk.red.dim,
    critical: chalk.bgRed.white.dim,
    dim: chalk.gray,
    highlight: chalk.cyan.dim,
    normal: chalk.white.dim,
    title: chalk.blue,
    border: 'gray'
  }
};

let currentTheme = 'default';
let verboseMode = false;

// Add visual status indicators and colors
const statusIcons = {
  major: '🔴', // Major update needed
  minor: '🟡', // Minor update available
  patch: '🟢', // Patch update available
  'UP-TO-DATE': '✅', // Up to date
  security: '🛡️', // Has security issues
  license: '⚖️', // Has license issues
  deprecated: '⚠️', // Deprecated package
  unknown: '❓', // Unknown status
};

// Then define the InteractiveMode class with all its methods
class InteractiveMode {
  constructor() {
    this.currentView = 'main';
    this.selectedIndex = 0;
    this.results = [];
    this.filters = {};
    this.theme = themes[currentTheme];
    this.modules = {};
    this.searchQuery = '';
    this.filterStatus = 'all';
    this.sortBy = 'name';
    this.showHelp = false;
    this.pageSize = process.stdout.rows - 15; // Adjust for screen size
    this.currentPage = 0;
    this.loading = false;
    this.lastAction = null;
  }

  async loadModules() {
    const [boxen, clear, figlet] = await Promise.all([
      import('boxen'),
      import('clear'),
      import('figlet')
    ]);

    this.modules = {
      boxen: boxen.default,
      clear: clear.default,
      figlet: figlet.default
    };
  }

  async start() {
    await this.loadModules();
    this.modules.clear();
    await this.showWelcomeScreen();
    await this.performInitialScan();
    this.setupKeyboardControls();
    this.render();
  }

  async showWelcomeScreen() {
    const welcomeBox = this.modules.boxen(
      this.theme.title(
        this.modules.figlet.textSync('Dep Guardian', { horizontalLayout: 'full' })
      ) +
      '\n\n' +
      this.theme.normal('Interactive Dependency Management') +
      '\n\n' +
      this.theme.info('Scanning your dependencies...') +
      '\n\n' +
      this.theme.dim('This might take a moment...'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: this.theme.border,
        float: 'center'
      }
    );
    console.log(welcomeBox);
  }

  async performInitialScan() {
    const spinner = ora({
      text: 'Scanning dependencies...',
      color: 'blue'
    }).start();
    
    try {
      this.results = await performFullScan();
      this.filteredResults = [...this.results];
      spinner.succeed('Scan complete');
    } catch (error) {
      spinner.fail('Scan failed');
      console.error(this.theme.error(error.message));
    }
  }

  setupKeyboardControls() {
    if (!process.stdin.isTTY) return;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      if (key === '\u0003' || key === 'q') { // Ctrl+C or q
        this.exit();
      }

      switch (key) {
        case '?':
          this.showHelp = !this.showHelp;
          break;
        case 'h':
          this.currentView = 'main';
          break;
        case 'f':
          await this.showFilterPrompt();
          break;
        case 's':
          await this.showSortPrompt();
          break;
        case '/':
          await this.showSearchPrompt();
          break;
        case 't':
          await this.cycleTheme();
          break;
        case 'v':
          await this.toggleVerboseMode();
          break;
        case 'r':
          await this.refresh();
          break;
        case '\r': // Enter
          await this.handleEnter();
          break;
        case '\u001b[A': // Up arrow
          this.moveSelection(-1);
          break;
        case '\u001b[B': // Down arrow
          this.moveSelection(1);
          break;
        case '\u001b[5~': // Page Up
          this.moveSelection(-10);
          break;
        case '\u001b[6~': // Page Down
          this.moveSelection(10);
          break;
      }
      this.render();
    });
  }

  async showFilterPrompt() {
    const { status } = await inquirer.prompt([
      {
        type: 'list',
        name: 'status',
        message: 'Filter by status:',
        choices: [
          { name: 'All packages', value: 'all' },
          { name: 'Needs update', value: 'outdated' },
          { name: 'Security issues', value: 'security' },
          { name: 'License issues', value: 'license' },
          { name: 'Up to date', value: 'current' }
        ]
      }
    ]);

    this.filterStatus = status;
    this.applyFilters();
  }

  async showSortPrompt() {
    const { sortBy } = await inquirer.prompt([
      {
        type: 'list',
        name: 'sortBy',
        message: 'Sort by:',
        choices: [
          { name: 'Name', value: 'name' },
          { name: 'Status', value: 'status' },
          { name: 'Security Risk', value: 'security' },
          { name: 'License', value: 'license' }
        ]
      }
    ]);

    this.sortBy = sortBy;
    this.applySort();
  }

  async showSearchPrompt() {
    const { query } = await inquirer.prompt([
      {
        type: 'input',
        name: 'query',
        message: 'Search packages:',
        prefix: '🔍'
      }
    ]);

    this.searchQuery = query;
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.results];

    // Apply search filter
    if (this.searchQuery) {
      filtered = filtered.filter(pkg => 
        pkg.name.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    switch (this.filterStatus) {
      case 'outdated':
        filtered = filtered.filter(pkg => pkg.versionStatus !== 'UP-TO-DATE');
        break;
      case 'security':
        filtered = filtered.filter(pkg => pkg.vulnCount > 0);
        break;
      case 'license':
        filtered = filtered.filter(pkg => pkg.licenseStatus === 'NON-COMPLIANT');
        break;
      case 'current':
        filtered = filtered.filter(pkg => pkg.versionStatus === 'UP-TO-DATE');
        break;
    }

    this.filteredResults = filtered;
    this.applySort();
  }

  applySort() {
    this.filteredResults.sort((a, b) => {
      switch (this.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          return this.getStatusWeight(b) - this.getStatusWeight(a);
        case 'security':
          return b.vulnCount - a.vulnCount;
        case 'license':
          return (b.licenseStatus === 'NON-COMPLIANT') - (a.licenseStatus === 'NON-COMPLIANT');
        default:
          return 0;
      }
    });
  }

  getStatusWeight(pkg) {
    const weights = {
      'major': 4,
      'minor': 3,
      'patch': 2,
      'UP-TO-DATE': 1,
      'ERROR': 0
    };
    return weights[pkg.versionStatus] || 0;
  }

  moveSelection(delta) {
    this.selectedIndex = Math.max(0, Math.min(
      this.selectedIndex + delta,
      this.filteredResults.length - 1
    ));
  }

  render() {
    this.modules.clear();
    
    // Header with stats and current filters
    const stats = this.getStats();
    console.log(this.modules.boxen(
      this.theme.title('Dependency Guardian') +
      '\n\n' +
      this.formatStats(stats) +
      (this.lastAction ? `\n\n${this.theme.dim(this.lastAction)}` : ''),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: this.theme.border,
        float: 'left'
      }
    ));

    // Package list with enhanced status display
    const startIdx = this.currentPage * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, this.filteredResults.length);
    const pageCount = Math.ceil(this.filteredResults.length / this.pageSize);

    this.filteredResults.slice(startIdx, endIdx).forEach((pkg, idx) => {
      const isSelected = (startIdx + idx) === this.selectedIndex;
      const { icons, details } = this.getPackageStatusInfo(pkg);
      const prefix = isSelected ? this.theme.highlight('❯ ') : '  ';
      const nameColor = isSelected ? this.theme.highlight : this.getStatusColor(pkg);
      
      console.log(
        prefix +
        nameColor(pkg.name.padEnd(30)) +
        this.theme.dim(pkg.currentVersion.padEnd(15)) +
        this.theme.info('→') +
        this.theme.dim(pkg.latestVersion.padEnd(15)) +
        ' ' + icons +
        (isSelected ? `\n    ${this.theme.dim(details)}` : '')
      );
    });

    // Footer with pagination and active filters
    const footer = [
      `Page ${this.currentPage + 1}/${pageCount}`,
      `Filter: ${this.filterStatus}`,
      `Sort: ${this.sortBy}`,
      this.searchQuery ? `Search: ${this.searchQuery}` : null
    ].filter(Boolean).join(' | ');

    console.log('\n' + this.theme.dim(footer));

    // Help panel
    if (this.showHelp) {
      this.renderHelpPanel();
    } else {
      console.log('\n' + this.theme.dim('Press ? for help'));
    }
  }

  renderHelpPanel() {
    const helpContent = [
      ['Navigation', [
        ['↑/↓', 'Navigate packages'],
        ['PgUp/PgDn', 'Jump pages'],
        ['Home/End', 'First/Last package']
      ]],
      ['Actions', [
        ['Enter', 'Package details'],
        ['u', 'Update package'],
        ['i', 'Package info'],
        ['c', 'View changelog']
      ]],
      ['Filters & Sort', [
        ['f', 'Filter menu'],
        ['s', 'Sort menu'],
        ['/', 'Search'],
        ['x', 'Clear filters']
      ]],
      ['Display', [
        ['?', 'Toggle help'],
        ['t', 'Change theme'],
        ['v', 'Toggle verbose'],
        ['r', 'Refresh data']
      ]]
    ];

    const helpBox = helpContent.map(([section, commands]) => {
      return this.theme.title(section) + '\n' +
        commands.map(([key, desc]) => 
          `${this.theme.highlight(key.padEnd(10))}${this.theme.normal(desc)}`
        ).join('\n');
    }).join('\n\n');

    console.log(this.modules.boxen(helpBox, {
      padding: 1,
      margin: { top: 1 },
      borderStyle: 'round',
      borderColor: this.theme.border,
      float: 'right'
    }));
  }

  getStats() {
    const total = this.results.length;
    const outdated = this.results.filter(p => p.versionStatus !== 'UP-TO-DATE').length;
    const security = this.results.filter(p => p.vulnCount > 0).length;
    const license = this.results.filter(p => p.licenseStatus === 'NON-COMPLIANT').length;

    return { total, outdated, security, license };
  }

  formatStats({ total, outdated, security, license }) {
    return [
      `Total: ${this.theme.normal(total)}`,
      `Updates: ${outdated > 0 ? this.theme.warning(outdated) : this.theme.success(0)}`,
      `Security: ${security > 0 ? this.theme.error(security) : this.theme.success(0)}`,
      `License: ${license > 0 ? this.theme.error(license) : this.theme.success(0)}`
    ].join(' | ');
  }

  getPackageStatusInfo(pkg) {
    const icons = [];
    const details = [];

    // Version status
    if (pkg.versionStatus !== 'UP-TO-DATE') {
      icons.push(statusIcons[pkg.versionStatus]);
      const updateType = pkg.versionStatus === 'major' ? 'Breaking change' : 
                        pkg.versionStatus === 'minor' ? 'New features' : 'Bug fixes';
      details.push(`${updateType} available`);
    }

    // Security status
    if (pkg.vulnCount > 0) {
      icons.push(statusIcons.security);
      details.push(`${pkg.vulnCount} ${pkg.vulnLevel} vulnerabilities`);
    }

    // License status
    if (pkg.licenseStatus === 'NON-COMPLIANT') {
      icons.push(statusIcons.license);
      details.push(`License issue: ${pkg.license}`);
    }

    return {
      icons: icons.join(' '),
      details: details.join(' | ')
    };
  }

  getStatusColor(pkg) {
    switch (pkg.versionStatus) {
      case 'major': return this.theme.error;
      case 'minor': return this.theme.warning;
      case 'patch': return this.theme.info;
      case 'UP-TO-DATE': return this.theme.success;
      default: return this.theme.normal;
    }
  }

  async handleEnter() {
    switch (this.currentView) {
      case 'main':
        this.currentView = 'details';
        break;
      case 'filters':
        await this.applyFilter();
        break;
      case 'details':
        await this.showPackageActions();
        break;
    }
  }

  async showPackageActions() {
    const pkg = this.results[this.selectedIndex];
    if (!pkg) return;

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Select action for ${pkg.name}`,
        choices: [
          { name: 'Update to Latest', value: 'update-latest' },
          { name: 'View Changelog', value: 'changelog' },
          { name: 'View Dependencies', value: 'dependencies' },
          { name: 'View Security Info', value: 'security' },
          { name: 'View License', value: 'license' },
          { name: 'Back', value: 'back' }
        ]
      }
    ]);

    switch (action) {
      case 'update-latest':
        await this.updatePackage(pkg);
        break;
      case 'changelog':
        await this.viewChangelog(pkg);
        break;
      case 'dependencies':
        await this.viewDependencies(pkg);
        break;
      case 'security':
        await this.viewSecurity(pkg);
        break;
      case 'license':
        await this.viewLicense(pkg);
        break;
    }
  }

  async refresh() {
    await this.performInitialScan();
    this.render();
  }

  exit() {
    this.modules.clear();
    console.log(chalk.blue('Thanks for using Dependency Guardian!'));
    process.exit(0);
  }
}

// Then add the program command
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    try {
      const interactive = new InteractiveMode();
      await interactive.start();
    } catch (error) {
      console.error(chalk.red('Error in interactive mode:', error.message));
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate dependency reports')
  .option('-t, --template <name>', 'Report template to use', 'default')
  .option('-o, --output <file>', 'Output file path')
  .option('-c, --compare', 'Compare with previous scan')
  .option('-f, --format <format>', 'Output format (markdown, html, pdf)', 'markdown')
  .option('--history', 'Show historical trends')
  .action(async (options) => {
    try {
      const reportManager = new ReportManager();
      const results = await performFullScan();
      
      // Save scan results for historical tracking
      await reportManager.saveScanResults(results);

      let compareWith = null;
      if (options.compare) {
        const history = JSON.parse(await fs.readFile(reportManager.historyFile, 'utf8'));
        if (history.scans.length > 1) {
          compareWith = history.scans[history.scans.length - 2].results;
        }
      }

      const report = await reportManager.generateReport(results, options.template, compareWith);

      if (options.output) {
        await fs.writeFile(options.output, report);
        console.log(chalk.green(`Report saved to: ${options.output}`));
      } else {
        console.log(report);
      }

    } catch (error) {
      console.error(chalk.red(`Error generating report: ${error.message}`));
      process.exit(1);
    }
  });

program.on('command:*', function () {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  displayWelcome();
  program.help();
}

async function loadPolicies(policyPaths) {
  const policies = new Map();
  
  for (const policyPath of policyPaths) {
    const content = await fs.readFile(policyPath, 'utf8');
    const policy = policyPath.endsWith('.yaml') || policyPath.endsWith('.yml')
      ? yaml.load(content)
      : JSON.parse(content);
      
    policies.set(policy.name, {
      ...policy,
      source: policyPath
    });
  }
  
  return policies;
}

async function resolvePolicyInheritance(policies) {
  const resolved = new Map();
  
  function mergePolicies(policy, visited = new Set()) {
    if (visited.has(policy.name)) {
      throw new Error(`Circular policy inheritance detected: ${Array.from(visited).join(' -> ')} -> ${policy.name}`);
    }
    
    if (resolved.has(policy.name)) {
      return resolved.get(policy.name);
    }
    
    visited.add(policy.name);
    
    const parentPolicies = (policy.extends || [])
      .map(parentName => {
        const parent = policies.get(parentName);
        if (!parent) {
          throw new Error(`Parent policy "${parentName}" not found for "${policy.name}"`);
        }
        return mergePolicies(parent, visited);
      });
    
    const mergedPolicy = parentPolicies.reduce((acc, parent) => deepMerge(acc, parent), {});
    const finalPolicy = deepMerge(mergedPolicy, policy);
    
    resolved.set(policy.name, finalPolicy);
    return finalPolicy;
  }
  
  for (const [name, policy] of policies.entries()) {
    if (!resolved.has(name)) {
      mergePolicies(policy);
    }
  }
  
  return resolved;
}

function validatePolicy(policy) {
  const errors = [];
  const warnings = [];
  
  // Validate required fields
  if (!policy.name) errors.push('Policy must have a name');
  if (!policy.version) errors.push('Policy must have a version');
  if (!policy.rules) errors.push('Policy must have rules defined');
  
  // Validate rules
  if (policy.rules) {
    if (policy.rules.licenses) {
      if (!Array.isArray(policy.rules.licenses.allowed)) {
        errors.push('License allowlist must be an array');
      }
      if (!Array.isArray(policy.rules.licenses.forbidden)) {
        errors.push('License blocklist must be an array');
      }
    }
    
    if (policy.rules.security) {
      const validSeverities = ['low', 'moderate', 'high', 'critical'];
      if (!validSeverities.includes(policy.rules.security.maxSeverity)) {
        errors.push('Invalid security severity level');
      }
    }
  }
  
  return { errors, warnings };
}

async function generatePolicyDocumentation(policy, template = 'default') {
  const templates = {
    default: `# ${policy.name} (v${policy.version})

## Description
${policy.description || 'No description provided.'}

## License Rules
- Allowed: ${policy.rules.licenses.allowed.join(', ')}
- Forbidden: ${policy.rules.licenses.forbidden.join(', ')}
- Unknown License Handling: ${policy.rules.licenses.unknown}

## Security Rules
- Maximum Severity: ${policy.rules.security.maxSeverity}
- Auto-fix Enabled: ${policy.rules.security.autofix}
${policy.rules.security.exceptions.length ? '\nExceptions:\n' + policy.rules.security.exceptions.map(e => `- ${e}`).join('\n') : ''}

## Versioning Rules
- Maximum Package Age: ${policy.rules.versioning.maxAge}
- Major Updates: ${policy.rules.versioning.allowMajorUpdates ? 'Allowed' : 'Forbidden'}
- Auto-merge Settings:
  - Patch: ${policy.rules.versioning.autoMerge.patch}
  - Minor: ${policy.rules.versioning.autoMerge.minor}
  - Major: ${policy.rules.versioning.autoMerge.major}

## Dependency Rules
- Maximum Direct Dependencies: ${policy.rules.dependencies.maxDirect}
- Maximum Dependency Depth: ${policy.rules.dependencies.maxDepth}
- Duplicates Allowed: ${policy.rules.dependencies.duplicatesAllowed}
${policy.rules.dependencies.bannedPackages.length ? '\nBanned Packages:\n' + policy.rules.dependencies.bannedPackages.map(p => `- ${p}`).join('\n') : ''}
${policy.rules.dependencies.requiredPackages.length ? '\nRequired Packages:\n' + policy.rules.dependencies.requiredPackages.map(p => `- ${p}`).join('\n') : ''}

## Notifications
- Slack: ${policy.notifications.slack}
- Email: ${policy.notifications.email}
- GitHub Issues: ${policy.notifications.githubIssues}

---
Generated on: ${new Date().toISOString()}
`
  };
  
  return templates[template] || templates.default;
}

async function performFullScan(config = {}) {
  const startTime = process.hrtime();
  const initialMemoryUsage = process.memoryUsage().heapUsed;

  // Ensure config has required properties with defaults
  const defaultConfig = {
    path: '.',
    includeDev: false,
    allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
    rules: {
      dependencies: {},
      devDependencies: {}
    }
  };

  config = { ...defaultConfig, ...config };
  
  const packageJson = await readPackageJson(config.path);
  const vulnerabilities = await getVulnerabilities(config.path);
  let results = [];

  if (Object.keys(packageJson.dependencies || {}).length > 0) {
    const dependencyResults = await scanDependencies(
      packageJson.dependencies,
      'dependencies',
      Array.isArray(config.allowedLicenses) ? config.allowedLicenses : defaultConfig.allowedLicenses,
      vulnerabilities,
      config.rules.dependencies
    );
    results = results.concat(dependencyResults);
  }

  if (config.includeDev && Object.keys(packageJson.devDependencies || {}).length > 0) {
    const devDependencyResults = await scanDependencies(
      packageJson.devDependencies,
      'devDependencies',
      Array.isArray(config.allowedLicenses) ? config.allowedLicenses : defaultConfig.allowedLicenses,
      vulnerabilities,
      config.rules.devDependencies
    );
    results = results.concat(devDependencyResults);
  }

  const endTime = process.hrtime(startTime);
  const duration = (endTime[0] + endTime[1] / 1e9).toFixed(2); // Convert to seconds
  const finalMemoryUsage = process.memoryUsage().heapUsed;

  // Only show performance metrics if not in JSON format
  if (!config.format || config.format !== 'json') {
    console.log(`\nScan Duration: ${duration} seconds`);
    console.log(`Memory Usage: ${((finalMemoryUsage - initialMemoryUsage) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Cache Performance: ${cacheHits} hits, ${cacheMisses} misses`);
  }

  // If JSON format is requested, return structured data
  if (config.format === 'json') {
    return {
      results,
      performance: {
        duration: parseFloat(duration),
        memoryUsage: (finalMemoryUsage - initialMemoryUsage) / 1024 / 1024,
        cacheHits,
        cacheMisses
      }
    };
  }

  return results;
}

async function initializeCIIntegration(type) {
  const templates = {
    github: {
      source: path.join(__dirname, 'templates', 'github-workflow.yml'),
      target: '.github/workflows/dependency-check.yml'
    },
    gitlab: {
      source: path.join(__dirname, 'templates', 'gitlab-ci.yml'),
      target: '.gitlab-ci.yml'
    },
    jenkins: {
      source: path.join(__dirname, 'templates', 'Jenkinsfile'),
      target: 'Jenkinsfile'
    }
  };

  const template = templates[type];
  if (!template) {
    throw new Error(`Unsupported CI type: ${type}`);
  }

  await fs.mkdir(path.dirname(template.target), { recursive: true });
  await fs.copyFile(template.source, template.target);
  console.log(chalk.green(`✅ ${type} CI configuration initialized`));
}

async function installGitHooks() {
  const hookPath = '.git/hooks/pre-commit';
  const templatePath = path.join(__dirname, 'templates', 'pre-commit');
  
  await fs.mkdir(path.dirname(hookPath), { recursive: true });
  await fs.copyFile(templatePath, hookPath);
  await fs.chmod(hookPath, '755');
  
  console.log(chalk.green('✅ Git hooks installed'));
}

async function runCICheck() {
  const defaultConfig = {
    path: '.',
    includeDev: true,
    allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
    output: {
      debug: false
    },
    rules: {
      dependencies: {},
      devDependencies: {}
    }
  };
  
  let config;
  try {
    const loadedConfig = await loadConfig();
    config = deepMerge(defaultConfig, loadedConfig || {});
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not load config, using defaults'));
    config = defaultConfig;
  }

  try {
    const results = await performFullScan(config);
    
    const hasHighSeverity = results.some(r => 
      ['HIGH', 'CRITICAL'].includes(r.vulnLevel)
    );
    
    const hasForbiddenLicense = results.some(r => 
      r.licenseStatus === 'NON-COMPLIANT'
    );
    
    return {
      hasIssues: hasHighSeverity || hasForbiddenLicense,
      results,
      config
    };
  } catch (error) {
    console.error(chalk.red('Error during CI check:', error.message));
    return {
      hasIssues: true,
      results: [],
      error: error.message,
      config
    };
  }
}

function filterDependencies(results, filters) {
  return results.filter(async (dep) => {
    // Filter by update status
    if (filters.status && !filters.status.includes(dep.versionStatus)) {
      return false;
    }
    
    // Filter by package name
    if (filters.name) {
      const regex = new RegExp(filters.name.replace(/\*/g, '.*'));
      if (!regex.test(dep.name)) {
        return false;
      }
    }
    
    // Filter by license
    if (filters.license && !filters.license.includes(dep.license)) {
      return false;
    }
    
    // Filter by vulnerability level
    if (filters.severity && !filters.severity.includes(dep.vulnLevel)) {
      return false;
    }
    
    // Filter by type (dependencies/devDependencies)
    if (filters.type && filters.type !== dep.type) {
      return false;
    }

    // New filters
    if (filters.maxSize || filters.maxGzip) {
      const sizeInfo = await getPackageSize(dep.name, dep.currentVersion);
      if (sizeInfo) {
        if (filters.maxSize && sizeInfo.size > filters.maxSize) {
          return false;
        }
        if (filters.maxGzip && sizeInfo.gzip > filters.maxGzip) {
          return false;
        }
      }
    }

    if (filters.minDownloads) {
      const stats = await getPackageStats(dep.name);
      if (stats && stats.downloads < filters.minDownloads) {
        return false;
      }
    }

    if (filters.lastUpdate) {
      const lastUpdateDate = new Date(dep.lastUpdate);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.lastUpdate);
      if (lastUpdateDate < cutoffDate) {
        return false;
      }
    }

    if (filters.depth !== undefined && dep.depth > filters.depth) {
      return false;
    }

    return true;
  });
}

async function showPackageDetails(dep) {
  console.clear();
  console.log(chalk.bold(`\nPackage Details: ${dep.name}\n`));
  
  // Display basic info
  console.log(chalk.dim('Version Info:'));
  console.log(`Current: ${chalk.blue(dep.currentVersion)}`);
  console.log(`Latest:  ${chalk.blue(dep.latestVersion)}`);
  console.log(`Status:  ${getStatusColor(dep.versionStatus)(dep.versionStatus)}`);
  if (dep.suggestedUpdate) {
    console.log(`Suggested Update: ${chalk.green(dep.suggestedUpdate)}`);
  }

  console.log(chalk.dim('\nLicense Info:'));
  console.log(`License: ${getLicenseColor(dep.licenseStatus)(dep.license)}`);
  console.log(`Status:  ${getLicenseColor(dep.licenseStatus)(dep.licenseStatus)}`);

  if (dep.vulnLevel !== 'NONE') {
    console.log(chalk.dim('\nVulnerabilities:'));
    console.log(`Level: ${chalk.red(dep.vulnLevel)}`);
    console.log(`Count: ${chalk.red(dep.vulnCount)}`);
  }

  // Show package details from npm
  const details = await getDetailedPackageInfo(dep.name);
  
  console.log(chalk.dim('\nPackage Info:'));
  console.log(`Description: ${details.description || 'No description'}`);
  console.log(`Homepage:    ${details.homepage || 'N/A'}`);
  console.log(`Repository:  ${details.repository || 'N/A'}`);
  console.log(`Downloads:   ${details.downloads}/month`);
  console.log(`Last Update: ${details.lastUpdate}`);

  // Update the action choices to include graph visualization
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Update to Latest', value: 'update-latest' },
        { name: 'Update to Suggested Version', value: 'update-suggested' },
        { name: 'View Changelog', value: 'changelog' },
        { name: 'View Dependencies', value: 'dependencies' },
        { name: 'View Dependency Graph', value: 'graph' },
        { name: 'View License Details', value: 'license' },
        { name: 'Back to List', value: 'back' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'update-latest':
    case 'update-suggested':
      await updatePackage(dep, action === 'update-latest' ? dep.latestVersion : dep.suggestedUpdate);
      break;
    case 'changelog':
      await viewChangelog(dep);
      break;
    case 'dependencies':
      await viewDependencies(dep);
      break;
    case 'graph':
      await displayDependencyGraph(dep);
      break;
    case 'license':
      await displayLicenseViewer(dep);
      break;
    case 'exit':
      process.exit(0);
  }
}

function getStatusColor(status) {
  const colors = {
    'UP-TO-DATE': 'green',
    'patch': 'yellow',
    'minor': 'yellow',
    'major': 'red',
    'ERROR': 'red'
  };
  return chalk[colors[status] || 'white'];
}

function getLicenseColor(status) {
  const colors = {
    'COMPLIANT': 'green',
    'NON-COMPLIANT': 'red',
    'UNKNOWN': 'yellow'
  };
  return chalk[colors[status] || 'white'];
}

async function getDetailedPackageInfo(packageName) {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
    const latest = response.data.versions[response.data['dist-tags'].latest];
    return {
      description: latest.description || response.data.description,
      homepage: latest.homepage || response.data.homepage,
      repository: latest.repository?.url || response.data.repository?.url || 'N/A',
      downloads: '(downloads data not available)', // Would need separate NPM API call
      lastUpdate: new Date(response.data.time.modified).toLocaleDateString()
    };
  } catch (error) {
    return {
      description: 'No description available',
      homepage: 'N/A',
      repository: 'N/A',
      downloads: 'N/A',
      lastUpdate: 'Unknown'
    };
  }
}

async function updatePackage(dep, version) {
  try {
    console.log(chalk.yellow(`\nUpdating ${dep.name} to version ${version}...`));
    await execPromise(`npm install ${dep.name}@${version}`);
    console.log(chalk.green('✅ Package updated successfully!'));
  } catch (error) {
    console.error(chalk.red('Error updating package:', error.message));
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function viewChangelog(dep) {
  console.clear();
  console.log(chalk.bold(`\nChangelog for ${dep.name}\n`));
  
  try {
    const response = await axios.get(`https://registry.npmjs.org/${dep.name}`);
    const versions = Object.keys(response.data.time)
      .filter(v => semver.valid(v))
      .sort(semver.rcompare);

    versions.forEach(version => {
      const date = new Date(response.data.time[version]).toLocaleDateString();
      console.log(chalk.blue(`\n${version}`) + chalk.dim(` (${date})`));
    });
  } catch (error) {
    console.error(chalk.red('Error fetching changelog:', error.message));
  }
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}

async function viewDependencies(dep) {
  console.clear();
  console.log(chalk.bold(`\nDependencies for ${dep.name}\n`));
  
  try {
    const response = await axios.get(`https://registry.npmjs.org/${dep.name}`);
    const latest = response.data.versions[response.data['dist-tags'].latest];
    
    if (latest.dependencies && Object.keys(latest.dependencies).length > 0) {
      console.log(chalk.dim('Dependencies:'));
      Object.entries(latest.dependencies).forEach(([name, version]) => {
        console.log(`${name}: ${chalk.blue(version)}`);
      });
    } else {
      console.log(chalk.dim('No dependencies'));
    }
    
    if (latest.devDependencies && Object.keys(latest.devDependencies).length > 0) {
      console.log(chalk.dim('\nDev Dependencies:'));
      Object.entries(latest.devDependencies).forEach(([name, version]) => {
        console.log(`${name}: ${chalk.blue(version)}`);
      });
    }
  } catch (error) {
    console.error(chalk.red('Error fetching dependencies:', error.message));
  }
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Add these helper functions after the existing ones
async function generateDependencyGraph(packagePath) {
  try {
    const madgeInstance = await madge(packagePath, {
      baseDir: packagePath,
      excludeRegExp: [/node_modules/]
    });

    const graph = madgeInstance.obj();
    const circular = madgeInstance.circular();
    
    return {
      dependencies: graph,
      circular: circular,
      moduleCount: Object.keys(graph).length,
      dependencyCount: Object.values(graph).reduce((acc, deps) => acc + deps.length, 0)
    };
  } catch (error) {
    console.error(chalk.red('Error generating dependency graph:', error.message));
    return null;
  }
}

async function displayDependencyGraph(dep) {
  console.clear();
  console.log(chalk.bold(`\nDependency Graph for ${dep.name}\n`));

  try {
    const graph = await generateDependencyGraph(dep.name);
    
    if (!graph) {
      console.log(chalk.yellow('Unable to generate dependency graph'));
      return;
    }

    // Display circular dependencies
    if (graph.circular.length > 0) {
      console.log(chalk.red('\nCircular Dependencies Detected:'));
      graph.circular.forEach(circle => {
        console.log(chalk.red(`  ${circle.join(' → ')}`));
      });
    }

    // Display dependency tree
    console.log(chalk.dim('\nDependency Tree:'));
    Object.entries(graph.dependencies).forEach(([module, deps]) => {
      console.log(chalk.blue(`\n${module}`));
      deps.forEach(dep => {
        console.log(chalk.dim(`  └─ ${dep}`));
      });
    });

    // Display statistics
    console.log(chalk.dim('\nStatistics:'));
    console.log(`Total Modules: ${chalk.blue(graph.moduleCount)}`);
    console.log(`Total Dependencies: ${chalk.blue(graph.dependencyCount)}`);
    console.log(`Circular Dependencies: ${chalk.red(graph.circular.length)}`);

  } catch (error) {
    console.error(chalk.red('Error:', error.message));
  }

  // Wait for user input
  await new Promise(resolve => {
    console.log(chalk.dim('\nPress any key to continue...'));
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

// Add these helper functions after the existing ones
async function getLicenseDetails(licenseName) {
  try {
    const response = await axios.get(`https://api.github.com/licenses/${licenseName.toLowerCase()}`);
    return {
      name: response.data.name,
      description: response.data.description,
      permissions: response.data.permissions,
      conditions: response.data.conditions,
      limitations: response.data.limitations,
      body: response.data.body
    };
  } catch (error) {
    return null;
  }
}

async function displayLicenseViewer(dep) {
  console.clear();
  console.log(chalk.bold(`\nLicense Information for ${dep.name}\n`));
  
  const licenseDetails = await getLicenseDetails(dep.license);
  
  if (!licenseDetails) {
    console.log(chalk.yellow(`Unable to fetch details for ${dep.license} license`));
    console.log(chalk.dim('\nBasic Information:'));
    console.log(`License: ${dep.license}`);
    console.log(`Status: ${getLicenseColor(dep.licenseStatus)(dep.licenseStatus)}`);
  } else {
    // Display license overview
    console.log(chalk.dim('License Overview:'));
    console.log(`Name: ${chalk.blue(licenseDetails.name)}`);
    console.log(`Status: ${getLicenseColor(dep.licenseStatus)(dep.licenseStatus)}`);
    
    if (licenseDetails.description) {
      console.log(chalk.dim('\nDescription:'));
      console.log(licenseDetails.description);
    }

    // Display permissions
    if (licenseDetails.permissions?.length > 0) {
      console.log(chalk.dim('\nPermissions:'));
      licenseDetails.permissions.forEach(permission => {
        console.log(chalk.green(`✓ ${permission}`));
      });
    }

    // Display conditions
    if (licenseDetails.conditions?.length > 0) {
      console.log(chalk.dim('\nConditions:'));
      licenseDetails.conditions.forEach(condition => {
        console.log(chalk.yellow(`! ${condition}`));
      });
    }

    // Display limitations
    if (licenseDetails.limitations?.length > 0) {
      console.log(chalk.dim('\nLimitations:'));
      licenseDetails.limitations.forEach(limitation => {
        console.log(chalk.red(`× ${limitation}`));
      });
    }

    // Show license text option
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'View Full License Text', value: 'view-text' },
          { name: 'Back', value: 'back' }
        ]
      }
    ]);

    if (action === 'view-text') {
      console.clear();
      console.log(chalk.bold(`\nFull License Text for ${dep.license}\n`));
      console.log(licenseDetails.body);
      
      // Wait for user input before returning
      await new Promise(resolve => {
        console.log(chalk.dim('\nPress any key to go back...'));
        process.stdin.once('data', resolve);
      });
    }
  }
}

// Add these helper functions for advanced filtering
async function getPackageSize(packageName, version) {
  try {
    const response = await axios.get(`https://bundlephobia.com/api/size?package=${packageName}@${version}`);
    return {
      size: response.data.size,
      gzip: response.data.gzip,
      dependencyCount: response.data.dependencyCount
    };
  } catch (error) {
    return null;
  }
}

async function getPackageStats(packageName) {
  try {
    const response = await axios.get(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
    return {
      downloads: response.data.downloads,
      start: response.data.start,
      end: response.data.end
    };
  } catch (error) {
    return null;
  }
}

// Add a method for batch API requests
async function getBatchPackageInfo(packageNames) {
  const results = await Promise.all(packageNames.map(name => getPackageInfo(name)));
  return results;
}

// Add a progress estimation feature
function displayProgress(current, total) {
  const percentage = ((current / total) * 100).toFixed(2);
  process.stdout.write(`\rProgress: ${percentage}% (${current}/${total})`);
}

// Add to store user preferences
const userPrefsFile = '.depguard/preferences.json';

// Add these functions for user preferences management
async function loadUserPreferences() {
  try {
    if (fsSync.existsSync(userPrefsFile)) {
      const prefs = JSON.parse(await fs.readFile(userPrefsFile, 'utf8'));
      currentTheme = prefs.theme || 'default';
      verboseMode = prefs.verbose || false;
      return prefs;
    }
  } catch (error) {
    console.error('Error loading preferences:', error.message);
  }
  return { theme: 'default', verbose: false, filterPresets: {} };
}

async function saveUserPreferences(prefs) {
  try {
    await fs.mkdir(path.dirname(userPrefsFile), { recursive: true });
    await fs.writeFile(userPrefsFile, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error('Error saving preferences:', error.message);
  }
}

// Add error handling utilities
class DependencyGuardianError extends Error {
  constructor(message, code, suggestions = []) {
    super(message);
    this.name = 'DependencyGuardianError';
    this.code = code;
    this.suggestions = suggestions;
  }

  prettyPrint() {
    const theme = themes[currentTheme];
    console.error(theme.error(`\n❌ Error: ${this.message}`));
    if (this.code) {
      console.error(theme.dim(`Error Code: ${this.code}`));
    }
    if (this.suggestions.length > 0) {
      console.error(theme.info('\nSuggestions:'));
      this.suggestions.forEach(suggestion => {
        console.error(theme.normal(`- ${suggestion}`));
      });
    }
  }
}

// Add keyboard shortcut handler
function setupKeyboardShortcuts() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (key) => {
      if (key === '\u0003') { // Ctrl+C
        process.exit();
      }
      
      switch (key) {
        case 'q':
          process.exit(0);
          break;
        case 'h':
          displayHelp();
          break;
        case 'r':
          refreshDisplay();
          break;
        case 'f':
          showFilterMenu();
          break;
        case 't':
          cycleTheme();
          break;
        case 'v':
          toggleVerboseMode();
          break;
      }
    });
  }
}

// Add these utility functions
async function cycleTheme() {
  const themeNames = Object.keys(themes);
  const currentIndex = themeNames.indexOf(currentTheme);
  currentTheme = themeNames[(currentIndex + 1) % themeNames.length];
  const prefs = await loadUserPreferences();
  await saveUserPreferences({ ...prefs, theme: currentTheme });
  console.log(`Theme switched to: ${currentTheme}`);
  refreshDisplay();
}

async function toggleVerboseMode() {
  verboseMode = !verboseMode;
  const prefs = await loadUserPreferences();
  await saveUserPreferences({ ...prefs, verbose: verboseMode });
  console.log(`Verbose mode: ${verboseMode ? 'enabled' : 'disabled'}`);
  refreshDisplay();
}

// Add to the program options
program
  .option('--theme <theme>', 'Set color theme (default, dark, light)', 'default')
  .option('--quiet', 'Minimal output')
  .option('--verbose', 'Detailed output')
  .option('--save-preset <name>', 'Save current filters as preset')
  .option('--load-preset <name>', 'Load saved filter preset');
