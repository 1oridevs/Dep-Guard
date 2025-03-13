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
const xml = require('xml');
const { promises: fsPromises } = require('fs');

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

// Move all command registrations to one place, before program.parse()
program
  .name('dependency-guardian')
  .description('A CLI tool to scan Node.js project dependencies for outdated packages, license compliance, and vulnerabilities')
  .version('1.0.0');

// Register the analyze command
program
  .command('analyze')
  .description('Perform advanced analysis on dependencies')
  .option('--ci', 'Run in CI mode (exits with error code on issues)')
  .option('--json', 'Output results in JSON format')
  .action(async (options) => {
    const spinner = ora('Analyzing dependencies...').start();
    
    try {
      const projectPath = process.cwd();
      const packageJson = await readPackageJson(projectPath);
      const dependencies = packageJson.dependencies || {};
      
      if (Object.keys(dependencies).length === 0) {
        spinner.info('No dependencies found in package.json');
        if (options.ci) process.exit(0);
        return;
      }

      // Store results for final output
      const results = {
        dependencies: Object.keys(dependencies).length,
        tree: {},
        circular: [],
        bundleSizes: {},
        duplicates: []
      };

      // Analyze dependency tree
      spinner.text = 'Analyzing dependency tree...';
      const tree = await analyzeDependencyTree(projectPath);
      results.tree = tree;
      
      if (Object.keys(tree).length === 0) {
        spinner.info('No dependencies found in node_modules');
        if (options.ci) process.exit(0);
        return;
      }
      
      spinner.succeed('Dependency tree analysis complete');

      // Only show detailed output if not in JSON mode
      if (!options.json) {
        console.log('\nDependency Analysis Results:');
        console.log('----------------------------');
      }

      // Detect circular dependencies
      spinner.start('Checking for circular dependencies...');
      const circularDeps = detectCircularDependencies(tree);
      results.circular = circularDeps;
      spinner.stop();
      
      if (!options.json) {
        if (circularDeps.length > 0) {
          console.log(chalk.yellow('\n⚠️  Circular Dependencies Detected:'));
          circularDeps.forEach(dep => {
            console.log(chalk.dim(`- ${dep}`));
          });
        } else {
          console.log(chalk.green('\n✅ No Circular Dependencies Detected'));
        }
      }

      // Analyze bundle sizes
      if (!options.json) {
        console.log('\nBundle Size Analysis:');
        console.log('-------------------');
      }
      
      const bundleSpinner = ora('Analyzing bundle sizes...').start();
      for (const [name, version] of Object.entries(dependencies)) {
        try {
          const bundleInfo = await analyzeBundleSize(name, version);
          if (bundleInfo) {
            results.bundleSizes[name] = bundleInfo;
            if (!options.json) {
              const sizeInKb = (bundleInfo.gzip / 1024).toFixed(2);
              bundleSpinner.info(
                `${name}@${version}: ${sizeInKb}kb (gzipped) | ${bundleInfo.dependencyCount} dependencies`
              );
            }
          }
        } catch (error) {
          if (!options.json) {
            bundleSpinner.warn(`Failed to analyze ${name}: ${error.message}`);
          }
        }
      }
      bundleSpinner.stop();

      // Detect duplicate dependencies
      spinner.start('Checking for duplicate dependencies...');
      const duplicates = detectDuplicateDependencies(dependencies);
      results.duplicates = duplicates;
      spinner.stop();
      
      if (!options.json) {
        if (duplicates.length > 0) {
          console.log(chalk.yellow('\n⚠️  Duplicate Dependencies Found:'));
          duplicates.forEach(({ name, version }) => {
            console.log(chalk.dim(`- ${name}@${version}`));
          });
        } else {
          console.log(chalk.green('\n✅ No Duplicate Dependencies Found'));
        }

        console.log('\nAnalysis complete! 🎉');
      }

      // Output JSON if requested
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      }

      // Exit with error code in CI mode if issues found
      if (options.ci && (circularDeps.length > 0 || duplicates.length > 0)) {
        process.exit(1);
      }

    } catch (error) {
      spinner.fail(chalk.red(`Analysis failed: ${error.message}`));
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
  });

// Register the scan command
program
  .command('scan')
  .description('Scan dependencies for issues')
  .option('--format <type>', 'Output format (json, csv, html, pretty)', 'pretty')
  .action(async (options) => {
    debugLog('Executing scan command with options:', options);
    const spinner = ora('Scanning dependencies...').start();
    
    try {
      const projectPath = process.cwd();
      debugLog('Project path:', projectPath);

      // Read package.json
      const packageJson = await readPackageJson(projectPath);
      debugLog('Package.json found:', packageJson.name);

      const dependencies = packageJson.dependencies || {};
      const depsCount = Object.keys(dependencies).length;
      debugLog('Dependencies found:', depsCount);
      
      if (depsCount === 0) {
        spinner.info('No dependencies found in package.json');
        return;
      }

      // Perform the scan with progress
      spinner.text = 'Analyzing dependencies...';
      const results = [];
      let processed = 0;

      for (const [name, version] of Object.entries(dependencies)) {
        processed++;
        spinner.text = `Analyzing dependencies... (${processed}/${depsCount})`;
        
        try {
          const latestVersion = await getLatestVersion(name);
          debugLog(`Checking ${name}: ${version} -> ${latestVersion}`);
          
          if (semver.lt(version.replace(/^\^|~/, ''), latestVersion)) {
            const diff = semver.diff(version.replace(/^\^|~/, ''), latestVersion);
            results.push({
              name,
              currentVersion: version,
              latestVersion,
              status: diff || 'outdated',
              updateType: diff
            });
          }
        } catch (error) {
          debugLog(`Error checking ${name}:`, error);
          spinner.warn(`Failed to check ${name}: ${error.message}`);
        }
      }

      spinner.stop();
      debugLog('Scan completed. Results:', results);

      // Display results
      if (results.length === 0) {
        console.log(chalk.green('\n✅ All dependencies are up to date!'));
        return;
      }

      // Group and display results
      const grouped = results.reduce((acc, result) => {
        const type = result.updateType || 'unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(result);
        return acc;
      }, {});

      // Output based on format
      switch (options.format.toLowerCase()) {
        case 'json':
          console.log(JSON.stringify(results, null, 2));
          break;
        case 'csv':
          console.log(convertResultsToCSV(results));
          break;
        case 'html':
          console.log(convertResultsToHTML(results));
          break;
        default:
          // Pretty print
          console.log('\n📦 Dependency Scan Results');
          console.log('=======================\n');

          if (grouped.major?.length) {
            console.log(chalk.red('🔴 Major Updates Required:'));
            grouped.major.forEach(dep => {
              console.log(chalk.dim('─────────────────────────'));
              console.log(chalk.bold(dep.name));
              console.log(chalk.dim(`Current: ${dep.currentVersion}`));
              console.log(chalk.green(`Latest:  ${dep.latestVersion}`));
              console.log(chalk.yellow(`Status:  Breaking changes (major update)`));
            });
            console.log('');
          }

          if (grouped.minor?.length) {
            console.log(chalk.yellow('🟡 Minor Updates Available:'));
            grouped.minor.forEach(dep => {
              console.log(chalk.dim('─────────────────────────'));
              console.log(chalk.bold(dep.name));
              console.log(chalk.dim(`Current: ${dep.currentVersion}`));
              console.log(chalk.green(`Latest:  ${dep.latestVersion}`));
              console.log(chalk.dim(`Status:  New features available`));
            });
            console.log('');
          }

          if (grouped.patch?.length) {
            console.log(chalk.blue('🔵 Patch Updates Available:'));
            grouped.patch.forEach(dep => {
              console.log(chalk.dim('─────────────────────────'));
              console.log(chalk.bold(dep.name));
              console.log(chalk.dim(`Current: ${dep.currentVersion}`));
              console.log(chalk.green(`Latest:  ${dep.latestVersion}`));
              console.log(chalk.dim(`Status:  Bug fixes available`));
            });
            console.log('');
          }

          // Print summary
          console.log(chalk.dim('─────────────────────────'));
          console.log('\n📊 Summary:');
          console.log(chalk.dim('──────────'));
          if (grouped.major) console.log(chalk.red(`Major updates: ${grouped.major.length}`));
          if (grouped.minor) console.log(chalk.yellow(`Minor updates: ${grouped.minor.length}`));
          if (grouped.patch) console.log(chalk.blue(`Patch updates: ${grouped.patch.length}`));
          console.log(chalk.dim(`\nTotal packages checked: ${depsCount}`));
          console.log(chalk.dim(`Updates needed: ${results.length}`));
      }

      console.log('\n');
      spinner.succeed('Scan complete! 🎉');

    } catch (error) {
      debugLog('Scan failed with error:', error);
      spinner.fail(chalk.red(`Scan failed: ${error.message}`));
      process.exit(1);
    }
  });

// Function to read and parse package.json
async function readPackageJson(projectPath) {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
    return JSON.parse(packageJsonContent);
  } catch (error) {
    throw new Error(`Failed to read or parse package.json: ${error.message}`);
  }
}

// Function to analyze the dependency tree
async function analyzeDependencyTree(projectPath) {
  try {
    const packageJson = await readPackageJson(projectPath);
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    const tree = {};
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const depPackageJsonPath = path.join(projectPath, 'node_modules', name, 'package.json');
        const depPackageJsonContent = await fs.readFile(depPackageJsonPath, 'utf8');
        const depPackageJson = JSON.parse(depPackageJsonContent);
        tree[name] = Object.keys(depPackageJson.dependencies || {});
      } catch (error) {
        tree[name] = [];
      }
    }

    return tree;
  } catch (error) {
    throw new Error(`Failed to analyze dependency tree: ${error.message}`);
  }
}

// Function to perform the dependency scan
async function performDependencyScan(dependencies) {
  const results = [];
  const spinner = ora('Analyzing dependencies...').start();
  let count = 0;
  const total = Object.keys(dependencies).length;

  for (const [name, version] of Object.entries(dependencies)) {
    count++;
    spinner.text = `Scanning ${name} (${count}/${total})`;
    
    try {
      const latestVersion = await getLatestVersion(name);
      if (semver.lt(version.replace(/^\^|~/, ''), latestVersion)) {
        const diff = semver.diff(version.replace(/^\^|~/, ''), latestVersion);
        results.push({
          name,
          currentVersion: version,
          latestVersion,
          status: diff || 'outdated',
          updateType: diff
        });
      }
    } catch (error) {
      spinner.warn(`Failed to check ${name}: ${error.message}`);
    }
  }

  spinner.stop();
  return results;
}

// Add these functions back for the scan command
function convertResultsToCSV(results) {
  const headers = ['Name', 'Current Version', 'Latest Version', 'Status'];
  const rows = results.map(r => [r.name, r.currentVersion, r.latestVersion, r.status]);
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function convertResultsToHTML(results) {
  const rows = results.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${r.currentVersion}</td>
      <td>${r.latestVersion}</td>
      <td>${r.status}</td>
    </tr>
  `).join('');
  
  return `
    <table>
    <thead>
      <tr>
          <th>Name</th>
          <th>Current Version</th>
          <th>Latest Version</th>
          <th>Status</th>
      </tr>
    </thead>
    <tbody>
        ${rows}
    </tbody>
  </table>
  `;
}

// Add this helper function if it's not already present
async function getLatestVersion(packageName) {
  try {
    const cacheKey = `latest-version-${packageName}`;
    const cachedVersion = registryCache.get(cacheKey);
    
    if (cachedVersion) {
      cacheHits++;
      return cachedVersion;
    }

    cacheMisses++;
    const response = await axios.get(`https://registry.npmjs.org/${packageName}/latest`);
    const version = response.data.version;
    
    registryCache.set(cacheKey, version);
    return version;
  } catch (error) {
    throw new Error(`Failed to get latest version: ${error.message}`);
  }
}

program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    try {
      console.log(chalk.blue('\n📦 Dependency Guardian Interactive Mode'));
      console.log(chalk.dim('=====================================\n'));

      const spinner = ora('Loading dependencies...').start();
      
      const projectPath = process.cwd();
      const packageJson = await readPackageJson(projectPath);
      const dependencies = packageJson.dependencies || {};
      
      if (Object.keys(dependencies).length === 0) {
        spinner.info('No dependencies found in package.json');
        process.exit(0);
      }

      // Perform the scan
      const results = await performDependencyScan(dependencies);
      spinner.succeed('Dependencies loaded');

      // Group results by update type
      const grouped = results.reduce((acc, result) => {
        const type = result.updateType || 'unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(result);
        return acc;
      }, {});

      // Display interactive menu
      const choices = [
        new inquirer.Separator('=== Updates ==='),
        ...(grouped.major?.length ? [{ name: `Major Updates (${grouped.major.length})`, value: 'major' }] : []),
        ...(grouped.minor?.length ? [{ name: `Minor Updates (${grouped.minor.length})`, value: 'minor' }] : []),
        ...(grouped.patch?.length ? [{ name: `Patch Updates (${grouped.patch.length})`, value: 'patch' }] : []),
        new inquirer.Separator('=== Actions ==='),
        { name: 'Scan Again', value: 'scan' },
        { name: 'Exit', value: 'exit' }
      ];

      while (true) {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices
          }
        ]);

        if (action === 'exit') {
          console.log(chalk.dim('\nGoodbye! 👋'));
          process.exit(0);
        }

        if (action === 'scan') {
          console.clear();
          continue;
        }

        // Show updates for selected type
        if (['major', 'minor', 'patch'].includes(action)) {
          const updates = grouped[action];
          const { selected } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'selected',
              message: `Select ${action} updates to apply:`,
              choices: updates.map(dep => ({
                name: `${dep.name} (${dep.currentVersion} → ${dep.latestVersion})`,
                value: dep
              }))
            }
          ]);

          if (selected.length > 0) {
            console.log(chalk.yellow('\nSelected updates:'));
            selected.forEach(dep => {
              console.log(chalk.dim(`- ${dep.name}: ${dep.currentVersion} → ${dep.latestVersion}`));
            });
          }
        }
      }

    } catch (error) {
      console.error(chalk.red('Failed to start interactive mode:', error.message));
      process.exit(1);
    }
  });

program
  .command('ci')
  .description('Run in CI mode')
  .option('--report <format>', 'Report format (junit, json)', 'junit')
  .action(async (options) => {
    const spinner = ora('Running CI checks...').start();
    
    try {
      const projectPath = process.cwd();
      const packageJson = await readPackageJson(projectPath);
      const dependencies = packageJson.dependencies || {};
      
      if (Object.keys(dependencies).length === 0) {
        spinner.info('No dependencies found in package.json');
        process.exit(0);
      }

      // Perform the scan
      const results = await performDependencyScan(dependencies);
      
      // Generate report
      let report;
      if (options.report === 'junit') {
        report = await generateJUnitReport(results);
      } else {
        report = JSON.stringify(results, null, 2);
      }

      // Write report to file
      const reportFile = options.report === 'junit' ? 'dependency-report.xml' : 'dependency-report.json';
      await fs.writeFile(reportFile, report);

      // Set GitHub Actions output if running in GitHub Actions
      if (process.env.GITHUB_ACTIONS) {
        const hasIssues = results.length > 0;
        console.log(`::set-output name=hasIssues::${hasIssues}`);
        console.log(`::set-output name=issueCount::${results.length}`);
        process.env.DEPGUARD_ISSUES = JSON.stringify(results);
      }

      // Exit with error if issues found
      if (results.length > 0) {
        spinner.fail(`Found ${results.length} issues`);
        process.exit(1);
      }

      spinner.succeed('All checks passed');
      process.exit(0);

    } catch (error) {
      spinner.fail(chalk.red(`CI check failed: ${error.message}`));
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
    this.loading = true;
    this.lastAction = 'Refreshing dependency data...';
    this.render();

    await this.performInitialScan();
    
    this.loading = false;
    this.lastAction = 'Refresh complete';
    this.render();
  }

  exit() {
    this.modules.clear();
    console.log(chalk.blue('Thanks for using Dependency Guardian!'));
    process.exit(0);
  }

  async cycleTheme() {
    const themeNames = Object.keys(themes);
    const currentIndex = themeNames.indexOf(currentTheme);
    currentTheme = themeNames[(currentIndex + 1) % themeNames.length];
    this.theme = themes[currentTheme];
    
    const prefs = await loadUserPreferences();
    await saveUserPreferences({ ...prefs, theme: currentTheme });
    
    this.lastAction = `Theme switched to: ${currentTheme}`;
    this.render();
  }

  async toggleVerboseMode() {
    verboseMode = !verboseMode;
    const prefs = await loadUserPreferences();
    await saveUserPreferences({ ...prefs, verbose: verboseMode });
    
    this.lastAction = `Verbose mode: ${verboseMode ? 'enabled' : 'disabled'}`;
    this.render();
  }

  async updatePackage(pkg) {
    this.loading = true;
    this.lastAction = `Updating ${pkg.name}...`;
    this.render();

    try {
      await execPromise(`npm install ${pkg.name}@${pkg.latestVersion}`);
      this.lastAction = `✅ Updated ${pkg.name} to ${pkg.latestVersion}`;
      await this.refresh();
    } catch (error) {
      this.lastAction = `❌ Failed to update ${pkg.name}: ${error.message}`;
      this.render();
    }
  }

  async viewChangelog(pkg) {
    this.loading = true;
    this.lastAction = `Loading changelog for ${pkg.name}...`;
    this.render();

    try {
      const response = await axios.get(`https://api.github.com/repos/${pkg.repository}/releases`);
      // Show changelog in a scrollable view
      await this.showScrollableContent(
        `Changelog for ${pkg.name}`,
        response.data.map(release => (
          `${this.theme.title(release.tag_name)}\n${release.body}\n`
        )).join('\n')
      );
    } catch (error) {
      this.lastAction = `❌ Failed to load changelog: ${error.message}`;
      this.render();
    }
  }

  async viewDependencies(pkg) {
    this.loading = true;
    this.lastAction = `Loading dependencies for ${pkg.name}...`;
    this.render();

    try {
      const response = await axios.get(`https://registry.npmjs.org/${pkg.name}`);
      const deps = response.data.versions[response.data['dist-tags'].latest].dependencies || {};
      await this.showScrollableContent(
        `Dependencies for ${pkg.name}@${pkg.currentVersion}`,
        Object.entries(deps)
          .map(([name, version]) => `${name}: ${version}`)
          .join('\n')
      );
    } catch (error) {
      this.lastAction = `❌ Failed to load dependencies: ${error.message}`;
      this.render();
    }
  }

  async viewSecurity(pkg) {
    if (!pkg.vulnCount) {
      this.lastAction = '✅ No known vulnerabilities';
      this.render();
        return;
      }
      
    try {
      const vulns = await this.getVulnerabilityDetails(pkg.name);
      await this.showScrollableContent(
        `Security Issues for ${pkg.name}`,
        vulns.map(vuln => (
          `${this.theme.error(vuln.severity.toUpperCase())}: ${vuln.title}\n` +
          `${this.theme.dim(vuln.description)}\n\n` +
          `Affected versions: ${vuln.vulnerable_versions}\n` +
          `Patched versions: ${vuln.patched_versions}\n` +
          `${this.theme.info('References:')}\n${vuln.references.join('\n')}\n`
        )).join('\n---\n')
      );
    } catch (error) {
      this.lastAction = `❌ Failed to load security info: ${error.message}`;
      this.render();
    }
  }

  async viewLicense(pkg) {
    this.loading = true;
    this.lastAction = `Loading license info for ${pkg.name}...`;
    this.render();

    try {
      const response = await axios.get(`https://registry.npmjs.org/${pkg.name}/${pkg.currentVersion}`);
      const license = response.data.license || 'Unknown';
      const licenseText = await this.getLicenseText(pkg.name, license);
      await this.showScrollableContent(
        `License: ${license}`,
        licenseText
      );
    } catch (error) {
      this.lastAction = `❌ Failed to load license: ${error.message}`;
      this.render();
    }
  }

  async showScrollableContent(title, content) {
    // Implementation for scrollable content view
    // This could use a library like blessed for better terminal UI
    console.clear();
    console.log(this.modules.boxen(
      `${this.theme.title(title)}\n\n${content}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: this.theme.border
      }
    ));
    console.log(this.theme.dim('\nPress q to go back'));
    
    // Wait for 'q' to be pressed
    return new Promise(resolve => {
      const onKeyPress = (key) => {
        if (key === 'q') {
          process.stdin.removeListener('data', onKeyPress);
          resolve();
          this.render();
        }
      };
      process.stdin.on('data', onKeyPress);
    });
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
      console.error(chalk.red('Failed to start interactive mode:', error.message));
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
  const spinner = ora('Running CI checks...').start();
  
  try {
    const config = await loadConfig();
    const results = await performFullScan({
    includeDev: true,
      allowedLicenses: config.allowedLicenses
    });
    
    const issues = results.filter(r => {
      // Check for security issues
      if (config.checks.security && r.vulnCount > 0) {
        return true;
      }
      
      // Check for license issues
      if (config.checks.license && r.licenseStatus === 'NON-COMPLIANT') {
        return true;
      }
      
      // Check for major version updates
      if (config.checks.updates && r.versionStatus === 'major') {
        return true;
      }
      
      return false;
    }).map(r => ({
      type: r.vulnCount > 0 ? 'Security' : 
            r.licenseStatus === 'NON-COMPLIANT' ? 'License' : 'Version',
      package: r.name,
      message: r.vulnCount > 0 ? `${r.vulnCount} ${r.vulnLevel} vulnerabilities found` :
               r.licenseStatus === 'NON-COMPLIANT' ? `Non-compliant license: ${r.license}` :
               `Major update available: ${r.currentVersion} → ${r.latestVersion}`
    }));

    // Generate reports
    if (config.ci.reportFormat === 'junit') {
      await generateJUnitReport(results);
      spinner.succeed('Generated JUnit report: dependency-report.xml');
    }

    // Set GitHub Actions outputs
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::set-output name=hasIssues::${issues.length > 0}`);
      console.log(`::set-output name=issueCount::${issues.length}`);
      process.env.DEPGUARD_ISSUES = JSON.stringify(issues);
    }

    // Handle issues based on configuration
    if (issues.length > 0) {
      spinner.fail(`Found ${issues.length} issues`);
      
      // Display issues
      issues.forEach(issue => {
        console.error(chalk.red(`\n${issue.type} issue in ${issue.package}:`));
        console.error(chalk.dim(issue.message));
      });

      // Exit with error if configured
      if (config.ci.failOnIssues) {
        process.exit(1);
      }
    } else {
      spinner.succeed('All dependency checks passed');
    }
  } catch (error) {
    spinner.fail('CI check failed');
    console.error(chalk.red('\nError:', error.message));
    process.exit(1);
  }
}

async function generateJUnitReport(results) {
  const testsuites = {
    testsuites: [{
      _attr: {
        name: 'dependency-guardian',
        tests: results.length,
        failures: results.length,
        time: '0'
      }
    }]
  };

  results.forEach(result => {
    testsuites.testsuites.push({
      testcase: [
        {
          _attr: {
            name: result.name,
            classname: 'DependencyCheck',
            time: '0'
          }
        },
        {
          failure: [
            {
              _attr: {
                type: result.updateType || 'update-needed',
                message: `Update available: ${result.currentVersion} → ${result.latestVersion}`
              }
            },
            `Current version: ${result.currentVersion}\nLatest version: ${result.latestVersion}\nUpdate type: ${result.updateType || 'unknown'}`
          ]
        }
      ]
    });
  });

  return xml(testsuites, { declaration: true, indent: '  ' });
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

// Add these configuration functions
async function loadConfig() {
  try {
    const explorer = cosmiconfig('depguard');
    const result = await explorer.search();
    
    const defaultConfig = {
      allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
      maxVulnerability: 'moderate',
      updateLevel: 'minor',
      checks: {
        security: true,
        license: true,
        updates: true
      },
      ignorePackages: [],
      ci: {
        failOnIssues: true,
        reportFormat: 'junit',
        createIssues: true
      }
    };

    if (!result || !result.config) {
      return defaultConfig;
    }

    return deepMerge(defaultConfig, result.config);
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not load config, using defaults'));
    return defaultConfig;
  }
}

// Function to detect circular dependencies
function detectCircularDependencies(tree) {
  const visited = new Map();
  const circularDeps = new Set();

  function visit(node, path = []) {
    if (visited.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart).concat(node);
        circularDeps.add(cycle.join(' → '));
      }
      return;
    }

    visited.set(node, true);
    path.push(node);

    const dependencies = tree[node] || [];
    for (const dep of dependencies) {
      visit(dep, [...path]);
    }

    path.pop();
    visited.delete(node);
  }

  try {
    Object.keys(tree).forEach(node => {
      if (!visited.has(node)) {
        visit(node);
      }
    });

    return Array.from(circularDeps);
  } catch (error) {
    throw new Error(`Failed to detect circular dependencies: ${error.message}`);
  }
}

// Function to analyze bundle size
async function analyzeBundleSize(packageName, version) {
  try {
    const response = await axios.get(`https://bundlephobia.com/api/size?package=${packageName}@${version}`);
    return {
      size: response.data.size,
      gzip: response.data.gzip,
      dependencyCount: response.data.dependencyCount
    };
  } catch (error) {
    console.error(`Failed to fetch bundle size for ${packageName}: ${error.message}`);
    return null;
  }
}

// Function to detect duplicate dependencies
function detectDuplicateDependencies(dependencies) {
  const seen = {};
  const duplicates = [];

  for (const [name, version] of Object.entries(dependencies)) {
    if (seen[name]) {
      duplicates.push({ name, version });
    } else {
      seen[name] = version;
    }
  }

  return duplicates;
}

// Add debug logging
const DEBUG = process.env.DEBUG || false;
const debugLog = (...args) => DEBUG && console.log(...args);

// At the start of the file, after imports
debugLog('Starting dependency-guardian...');

// Make sure to add this at the end of the file
program.parse(process.argv);
