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

program
  .command('scan')
  .description('Scan project dependencies for issues')
  .option('-p, --path <path>', 'path to project directory', '.')
  .option('-d, --include-dev', 'include devDependencies in scan', false)
  .option('-l, --licenses <licenses>', 'allowed licenses (comma-separated)')
  .option('-f, --format <format>', 'output format (console, json, csv, html)')
  .option('-o, --output <file>', 'output file path')
  .option('-c, --config <path>', 'path to config file')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      
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

      const format = options.format || config.output.defaultFormat;
      const outputPath = options.output || 
        (format !== 'console' ? path.join(config.output.reportsDir, `report.${format}`) : null);

      if (outputPath) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
      }

      if (format === 'console' && !config.output.silent) {
        displayResults(results);
      } else if (formatters[format]) {
        const output = await formatters[format](results, outputPath);
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

program.on('command:*', function () {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  displayWelcome();
  program.help();
}
