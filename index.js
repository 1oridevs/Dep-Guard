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
    return cached;
  }

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
    
    const promises = Object.entries(dependencies).map(([name, version]) => 
      limit(async () => {
        const { latestVersion, license, versions } = await getPackageInfo(name);
        const { type: versionStatus, suggestedUpdate } = analyzeVersionChange(version, latestVersion, versions);
        const licenseStatus = checkLicenseCompliance(license, allowedLicenses);
        const { level: vulnLevel, count: vulnCount } = getSeverityLevel(vulnerabilities[name]);
        
        progressBar.increment();
        
        return {
          name,
          type,
          currentVersion: version,
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

const formatters = {
  async json(results, outputPath) {
    const output = {
      timestamp: new Date().toISOString(),
      summary: generateSummary(results),
      results: results
    };
    
    if (outputPath) {
      await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
      return `JSON report saved to: ${outputPath}`;
    }
    return JSON.stringify(output, null, 2);
  },

  async csv(results, outputPath) {
    const headers = [
      'Package Name',
      'Type',
      'Current Version',
      'Latest Version',
      'Suggested Update',
      'License',
      'Version Status',
      'License Status',
      'Security Level',
      'Vulnerabilities Count'
    ].join(',');

    const rows = results.map(r => [
      r.name,
      r.type,
      r.currentVersion,
      r.latestVersion,
      r.suggestedUpdate || 'N/A',
      r.license,
      r.versionStatus,
      r.licenseStatus,
      r.vulnLevel,
      r.vulnCount
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    
    if (outputPath) {
      await fs.writeFile(outputPath, csv);
      return `CSV report saved to: ${outputPath}`;
    }
    return csv;
  },

  async html(results, outputPath) {
    const template = `
<!DOCTYPE html>
<html>
<head>
  <title>Dependency Guardian Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
    .summary { margin: 20px 0; }
    .dependencies { border-collapse: collapse; width: 100%; }
    .dependencies th, .dependencies td { 
      border: 1px solid #ddd; 
      padding: 8px; 
      text-align: left; 
    }
    .dependencies th { background: #f0f0f0; }
    .up-to-date { color: green; }
    .major { color: red; }
    .minor { color: orange; }
    .patch { color: blue; }
    .error { color: red; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Dependency Guardian Report</h1>
    <p>Generated on: ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="summary">
    <h2>Summary</h2>
    <pre>${JSON.stringify(generateSummary(results), null, 2)}</pre>
  </div>

  <h2>Dependencies</h2>
  <table class="dependencies">
    <thead>
      <tr>
        <th>Package</th>
        <th>Type</th>
        <th>Current</th>
        <th>Latest</th>
        <th>Suggested</th>
        <th>License</th>
        <th>Version Status</th>
        <th>License Status</th>
        <th>Security</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(r => `
        <tr>
          <td>${r.name}</td>
          <td>${r.type}</td>
          <td>${r.currentVersion}</td>
          <td>${r.latestVersion}</td>
          <td>${r.suggestedUpdate || 'N/A'}</td>
          <td>${r.license}</td>
          <td class="${r.versionStatus.toLowerCase()}">${r.versionStatus}</td>
          <td>${r.licenseStatus}</td>
          <td>${r.vulnLevel} (${r.vulnCount})</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;
    
    if (outputPath) {
      await fs.writeFile(outputPath, template);
      return `HTML report saved to: ${outputPath}`;
    }
    return template;
  },

  async analysis(results, outputPath) {
    const analysisResults = {
      timestamp: new Date().toISOString(),
      dependencyAnalysis: results.treeAnalysis,
      packageAnalysis: results.results,
      summary: {
        totalPackages: results.results.length,
        uniqueDependencies: results.treeAnalysis.totalDependencies,
        maxDepth: results.treeAnalysis.depth,
        circularDependencies: results.treeAnalysis.circular.length,
        duplicateDependencies: Array.from(results.treeAnalysis.duplicates.keys()).length
      }
    };

    if (outputPath) {
      await fs.writeFile(outputPath, JSON.stringify(analysisResults, null, 2));
      return `Analysis report saved to: ${outputPath}`;
    }
    return JSON.stringify(analysisResults, null, 2);
  }
};

function generateSummary(results) {
  return results.reduce((acc, { versionStatus, licenseStatus, vulnLevel }) => {
    if (['major', 'minor', 'patch'].includes(versionStatus)) {
      acc.versions[versionStatus] = (acc.versions[versionStatus] || 0) + 1;
    } else {
      acc.versions[versionStatus] = (acc.versions[versionStatus] || 0) + 1;
    }
    acc.licenses[licenseStatus] = (acc.licenses[licenseStatus] || 0) + 1;
    acc.vulnerabilities[vulnLevel] = (acc.vulnerabilities[vulnLevel] || 0) + 1;
    return acc;
  }, { 
    versions: {}, 
    licenses: {}, 
    vulnerabilities: {},
    totalPackages: results.length
  });
}

const defaultConfig = {
  allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
  ignorePatterns: ['**/node_modules/**', '**/dist/**'],
  rules: {
    dependencies: {
      maxAge: '6 months',
      forbiddenLicenses: ['GPL'],
      requireLicense: true
    },
    devDependencies: {
      maxAge: '1 year',
      forbiddenLicenses: [],
      requireLicense: false
    }
  },
  output: {
    defaultFormat: 'console',
    reportsDir: './reports',
    silent: false,
    debug: false
  },
  notifications: {
    exitOnHighSeverity: true,
    exitOnForbiddenLicense: true
  }
};

async function loadConfig(configPath) {
  try {
    const explorer = cosmiconfig('depguard');
    const result = configPath 
      ? await explorer.load(configPath)
      : await explorer.search();
    
    return result ? { ...defaultConfig, ...result.config } : defaultConfig;
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not load config file. Using defaults. (${error.message})`));
    return defaultConfig;
  }
}

async function analyzeDependencyTree(projectPath) {
  try {
    const tree = dependencyTree({
      filename: path.join(projectPath, 'package.json'),
      directory: projectPath,
      filter: path => path.indexOf('node_modules') === -1
    });
    
    const madgeInstance = await madge(projectPath, {
      baseDir: projectPath,
      excludeRegExp: [/node_modules/]
    });

    const circularDeps = madgeInstance.circular();
    const duplicates = findDuplicateDependencies(tree);
    
    return {
      tree,
      circular: circularDeps,
      duplicates,
      depth: calculateTreeDepth(tree),
      totalDependencies: countDependencies(tree)
    };
  } catch (error) {
    console.error(chalk.red('Error analyzing dependency tree:', error.message));
    return null;
  }
}

function findDuplicateDependencies(tree) {
  const versions = new Map();
  const duplicates = new Map();

  function traverse(node, path = []) {
    Object.entries(node).forEach(([name, subTree]) => {
      const currentPath = [...path, name];
      if (!versions.has(name)) {
        versions.set(name, new Set());
      }
      versions.get(name).add(currentPath.join(' → '));
      
      if (typeof subTree === 'object') {
        traverse(subTree, currentPath);
      }
    });
  }

  traverse(tree);

  versions.forEach((paths, name) => {
    if (paths.size > 1) {
      duplicates.set(name, Array.from(paths));
    }
  });

  return duplicates;
}

function calculateTreeDepth(tree) {
  function getDepth(node) {
    if (typeof node !== 'object' || Object.keys(node).length === 0) {
      return 0;
    }
    return 1 + Math.max(...Object.values(node).map(getDepth));
  }
  return getDepth(tree);
}

function countDependencies(tree) {
  const unique = new Set();
  
  function traverse(node) {
    Object.keys(node).forEach(dep => {
      unique.add(dep);
      if (typeof node[dep] === 'object') {
        traverse(node[dep]);
      }
    });
  }
  
  traverse(tree);
  return unique.size;
}

function displayAdvancedAnalysis(treeAnalysis) {
  console.log(chalk.bold('\nAdvanced Dependency Analysis:'));
  console.log('----------------------------------------');
  
  console.log(chalk.bold('\nDependency Tree Statistics:'));
  console.log(`📦 Total Unique Dependencies: ${chalk.blue(treeAnalysis.totalDependencies)}`);
  console.log(`📏 Maximum Tree Depth: ${chalk.blue(treeAnalysis.depth)}`);
  
  if (treeAnalysis.circular.length > 0) {
    console.log(chalk.bold('\n⚠️  Circular Dependencies Detected:'));
    treeAnalysis.circular.forEach((circle, index) => {
      console.log(chalk.yellow(`${index + 1}. ${circle.join(' → ')}`));
    });
  } else {
    console.log(chalk.green('\n✅ No circular dependencies detected'));
  }

  if (treeAnalysis.duplicates.size > 0) {
    console.log(chalk.bold('\n⚠️  Duplicate Dependencies Detected:'));
    treeAnalysis.duplicates.forEach((paths, name) => {
      console.log(chalk.yellow(`\n${name} appears in multiple paths:`));
      paths.forEach((path, index) => {
        console.log(chalk.dim(`  ${index + 1}. ${path}`));
      });
    });
  } else {
    console.log(chalk.green('\n✅ No duplicate dependencies detected'));
  }
  
  console.log('\n----------------------------------------');
}

program
  .command('scan')
  .description('Scan project dependencies for issues')
  .option('-p, --path <path>', 'project path')
  .option('-i, --include-dev', 'include devDependencies')
  .option('-f, --format <format>', 'output format (console, json, csv)', 'console')
  .option('-o, --output <file>', 'output file path')
  .option('-a, --advanced', 'perform advanced dependency analysis', false)
  .option('-P, --policy <name>', 'policy to use for scanning')
  .option('--ci', 'Run in CI mode (stricter checks, exit codes)', false)
  .option('--filter-status <status>', 'Filter by update status (comma-separated: UP-TO-DATE,major,minor,patch)')
  .option('--filter-name <pattern>', 'Filter by package name pattern')
  .option('--filter-license <licenses>', 'Filter by license (comma-separated)')
  .option('--filter-severity <levels>', 'Filter by vulnerability severity (comma-separated: HIGH,CRITICAL,MODERATE,LOW)')
  .option('--deps-only', 'Show only dependencies')
  .option('--dev-deps-only', 'Show only devDependencies')
  .option('--sort <field>', 'Sort by field (name, version, license, severity)', 'name')
  .option('--reverse', 'Reverse sort order')
  .action(async (options) => {
    let config;
    try {
      const defaultConfig = {
        path: options.path || '.',
        includeDev: options.includeDev || false,
        allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
        output: {
          format: options.format || 'console',
          silent: false,
          debug: false
        },
        rules: {
          dependencies: {},
          devDependencies: {}
        },
        notifications: {
          exitOnHighSeverity: false,
          exitOnForbiddenLicense: false
        }
      };

      try {
        const explorer = cosmiconfig('depguard');
        const result = await explorer.search();
        config = result ? {
          ...deepMerge(defaultConfig, result.config),
          allowedLicenses: result.config.allowedLicenses || defaultConfig.allowedLicenses
        } : defaultConfig;
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not load config, using defaults'));
        config = defaultConfig;
      }

      if (!config.output.silent) {
        displayWelcome();
        console.log(chalk.yellow('Scanning dependencies...'));
        console.log(chalk.dim(`Project path: ${config.path}`));
      }

      const results = await performFullScan(config);

      // Apply filters
      const filters = {
        status: options.filterStatus?.split(','),
        name: options.filterName,
        license: options.filterLicense?.split(','),
        severity: options.filterSeverity?.split(','),
        type: options.depsOnly ? 'dependencies' : 
              options.devDepsOnly ? 'devDependencies' : null
      };

      let filteredResults = filterDependencies(results, filters);

      // Apply sorting
      if (options.sort) {
        const sortField = options.sort;
        filteredResults.sort((a, b) => {
          let comparison;
          switch (sortField) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'version':
              comparison = semver.compare(
                a.currentVersion.replace(/[\^~]/, ''),
                b.currentVersion.replace(/[\^~]/, '')
              );
              break;
            case 'license':
              comparison = a.license.localeCompare(b.license);
              break;
            case 'severity':
              const severityOrder = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1, NONE: 0 };
              comparison = (severityOrder[a.vulnLevel] || 0) - (severityOrder[b.vulnLevel] || 0);
              break;
            default:
              comparison = 0;
          }
          return options.reverse ? -comparison : comparison;
        });
      }

      // Handle output format
      if (options.format === 'json') {
        const output = {
          results: filteredResults,
          summary: {
            total: results.length,
            filtered: filteredResults.length,
            filters: filters
          }
        };
        console.log(JSON.stringify(output, null, 2));
      } else if (options.format === 'console' && !config.output.silent) {
        displayResults(filteredResults);
        
        // Show filter summary
        if (Object.values(filters).some(v => v)) {
          console.log(chalk.dim('\nActive Filters:'));
          if (filters.status) console.log(chalk.dim(`Status: ${filters.status.join(', ')}`));
          if (filters.name) console.log(chalk.dim(`Name: ${filters.name}`));
          if (filters.license) console.log(chalk.dim(`License: ${filters.license.join(', ')}`));
          if (filters.severity) console.log(chalk.dim(`Severity: ${filters.severity.join(', ')}`));
          if (filters.type) console.log(chalk.dim(`Type: ${filters.type}`));
          console.log(chalk.dim(`\nShowing ${filteredResults.length} of ${results.length} dependencies`));
        }
      }

      // Handle exit conditions
      const hasHighSeverity = filteredResults.some(r => ['HIGH', 'CRITICAL'].includes(r.vulnLevel));
      const hasForbiddenLicense = filteredResults.some(r => r.licenseStatus === 'NON-COMPLIANT');

      if (config.notifications.exitOnHighSeverity && hasHighSeverity) {
        process.exit(1);
      }

      if (config.notifications.exitOnForbiddenLicense && hasForbiddenLicense) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error.message}`));
      if (config?.output?.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function filterDependencies(dependencies, ignorePatterns) {
  if (!ignorePatterns || ignorePatterns.length === 0) return dependencies;
  
  return Object.fromEntries(
    Object.entries(dependencies).filter(([name]) => 
      !ignorePatterns.some(pattern => 
        new RegExp(pattern.replace(/\*/g, '.*')).test(name)
      )
    )
}

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

program
  .command('interactive')
  .alias('i')
  .description('Run in interactive mode')
  .option('-p, --path <path>', 'project path')
  .action(async (options) => {
    try {
      displayWelcome();
      const results = await performFullScan({
        path: options.path || '.',
        includeDev: true
      });

      const choices = results.map(dep => ({
        name: `${dep.name} (${dep.currentVersion} → ${dep.latestVersion})`,
        value: dep,
        short: dep.name
      }));

      const { selectedDep } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedDep',
          message: 'Select a package to view/update:',
          choices,
          pageSize: 15
        }
      ]);

      await showPackageDetails(selectedDep);
    } catch (error) {
      console.error(chalk.red(`\nError: ${error.message}`));
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
  return results.filter(dep => {
    // Filter by update status
    if (filters.status && !filters.status.includes(dep.versionStatus)) {
      return false;
    }
    
    // Filter by package name
    if (filters.name && !dep.name.includes(filters.name)) {
      return false;
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
    
    // Custom filter function
    if (filters.custom && !filters.custom(dep)) {
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
