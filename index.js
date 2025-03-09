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
  try {
    const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
    const latestVersion = response.data['dist-tags'].latest;
    const license = response.data.versions[latestVersion].license || 'Unknown';
    const versions = Object.keys(response.data.versions);
    return { 
      latestVersion, 
      license,
      versions: versions.filter(v => semver.valid(v)).sort(semver.rcompare)
    };
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

function checkLicenseCompliance(license, allowedLicenses) {
  if (!license || license === 'Unknown') return 'UNKNOWN';
  return allowedLicenses.includes(license) ? 'COMPLIANT' : 'NON-COMPLIANT';
}

async function scanDependencies(dependencies, type = 'dependencies', allowedLicenses, vulnerabilities, rules) {
  const results = [];
  
  for (const [name, version] of Object.entries(dependencies)) {
    const { latestVersion, license, versions } = await getPackageInfo(name);
    const { type: versionStatus, suggestedUpdate } = analyzeVersionChange(version, latestVersion, versions);
    const licenseStatus = checkLicenseCompliance(license, allowedLicenses);
    const { level: vulnLevel, count: vulnCount } = getSeverityLevel(vulnerabilities[name]);
    
    results.push({
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
    });
  }
  
  return results;
}

function displayResults(results) {
  console.log('\nDependency Scan Results:\n');
  
  const grouped = results.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([type, deps]) => {
    console.log(chalk.cyan.bold(`\n${type}:`));
    deps.forEach(({ name, currentVersion, latestVersion, suggestedUpdate, license, versionStatus, licenseStatus, vulnLevel, vulnCount }) => {
      const versionStatusColor = {
        'UP-TO-DATE': 'green',
        'major': 'red',
        'minor': 'yellow',
        'patch': 'blue',
        'ERROR': 'red'
      }[versionStatus];

      const versionText = suggestedUpdate ? 
        `${versionStatus.toUpperCase()} update available (${suggestedUpdate})` :
        versionStatus;

      const licenseStatusColor = {
        'COMPLIANT': 'green',
        'NON-COMPLIANT': 'red',
        'UNKNOWN': 'yellow'
      }[licenseStatus];

      const vulnColor = {
        'NONE': 'green',
        'LOW': 'blue',
        'MODERATE': 'yellow',
        'HIGH': 'red',
        'CRITICAL': 'redBright'
      }[vulnLevel];
      
      const vulnText = vulnLevel === 'NONE' 
        ? 'No vulnerabilities' 
        : `${vulnCount} ${vulnLevel.toLowerCase()} severity`;
      
      console.log(
        `${chalk.bold(name)} - ` +
        `Current: ${chalk.blue(currentVersion)} | ` +
        `Latest: ${chalk.blue(latestVersion)} | ` +
        `Update: ${chalk[versionStatusColor](versionText)} | ` +
        `License: ${chalk[licenseStatusColor](license)} | ` +
        `Security: ${chalk[vulnColor](vulnText)}`
      );
    });
  });

  displaySummary(results);
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
  .option('-p, --path <path>', 'path to project directory', '.')
  .option('-d, --include-dev', 'include devDependencies in scan', false)
  .option('-l, --licenses <licenses>', 'allowed licenses (comma-separated)')
  .option('-f, --format <format>', 'output format (console, json, csv, html)')
  .option('-o, --output <file>', 'output file path')
  .option('-c, --config <path>', 'path to config file')
  .option('-a, --advanced', 'perform advanced dependency analysis', false)
  .option('-P, --policy <name>', 'policy to use for scanning')
  .action(async (options) => {
    try {
      let config = await loadConfig(options.config);
      
      if (options.policy) {
        const policyFiles = glob.sync('policies/**/*.{json,yaml,yml}');
        const policies = await loadPolicies(policyFiles);
        const resolvedPolicies = await resolvePolicyInheritance(policies);
        
        const policy = resolvedPolicies.get(options.policy);
        if (!policy) {
          console.error(chalk.red(`Policy "${options.policy}" not found`));
          process.exit(1);
        }
        
        // Merge policy with config
        config = deepMerge(config, {
          allowedLicenses: policy.rules.licenses.allowed,
          rules: {
            dependencies: {
              maxAge: policy.rules.versioning.maxAge,
              forbiddenLicenses: policy.rules.licenses.forbidden,
              requireLicense: policy.rules.licenses.unknown === 'error'
            }
          },
          notifications: {
            exitOnHighSeverity: policy.rules.security.maxSeverity !== 'critical',
            exitOnForbiddenLicense: true
          }
        });
      }
      
      if (!config.output.silent) {
        displayWelcome();
        console.log(chalk.yellow('Scanning dependencies...'));
        console.log(chalk.dim(`Project path: ${options.path}`));
      }

      const allowedLicenses = options.licenses
        ? options.licenses.split(',').map(l => l.trim())
        : config.allowedLicenses;

      if (config.output.debug) {
        console.log(chalk.dim('Config:', JSON.stringify(config, null, 2)));
      }
      
      const packageJson = await readPackageJson(options.path);
      const vulnerabilities = await getVulnerabilities(options.path);
      let results = [];

      if (Object.keys(packageJson.dependencies || {}).length > 0) {
        const filteredDeps = filterDependencies(packageJson.dependencies, config.ignorePatterns);
        const dependencyResults = await scanDependencies(
          filteredDeps,
          'dependencies',
          allowedLicenses,
          vulnerabilities,
          config.rules.dependencies
        );
        results = results.concat(dependencyResults);
      }

      if (options.includeDev && Object.keys(packageJson.devDependencies || {}).length > 0) {
        const filteredDevDeps = filterDependencies(packageJson.devDependencies, config.ignorePatterns);
        const devDependencyResults = await scanDependencies(
          filteredDevDeps,
          'devDependencies',
          allowedLicenses,
          vulnerabilities,
          config.rules.devDependencies
        );
        results = results.concat(devDependencyResults);
      }

      if (results.length === 0) {
        console.log(chalk.yellow('\nNo dependencies found to scan!'));
        return;
      }

      let treeAnalysis = null;
      if (options.advanced) {
        console.log(chalk.yellow('\nPerforming advanced dependency analysis...'));
        treeAnalysis = await analyzeDependencyTree(options.path);
      }

      const format = options.format || config.output.defaultFormat;
      const outputPath = options.output || 
        (format !== 'console' ? path.join(config.output.reportsDir, `report.${format}`) : null);

      if (outputPath) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
      }

      if (format === 'console' && !config.output.silent) {
        displayResults(results);
        if (treeAnalysis) {
          displayAdvancedAnalysis(treeAnalysis);
        }
      } else if (formatters[format]) {
        const output = await formatters[format]({ results, treeAnalysis }, outputPath);
        if (outputPath) {
          console.log(chalk.green(output));
        } else {
          console.log(output);
        }
      } else {
        console.error(chalk.red(`Unsupported format: ${format}`));
        process.exit(1);
      }

      // Handle exit conditions
      const hasHighSeverity = results.some(r => ['HIGH', 'CRITICAL'].includes(r.vulnLevel));
      const hasForbiddenLicense = results.some(r => r.licenseStatus === 'NON-COMPLIANT');

      if (config.notifications.exitOnHighSeverity && hasHighSeverity) {
        console.error(chalk.red('\nHigh severity vulnerabilities found!'));
        process.exit(1);
      }

      if (config.notifications.exitOnForbiddenLicense && hasForbiddenLicense) {
        console.error(chalk.red('\nForbidden licenses found!'));
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
  );
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
