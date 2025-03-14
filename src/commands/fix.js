const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const dependencyScanner = require('../core/analyzers/dependency-scanner');
const logger = require('../utils/logger');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function fixCommand(program) {
  program
    .command('fix')
    .description('Automatically fix dependency issues')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--security', 'Fix only security issues')
    .option('--outdated', 'Fix only outdated packages')
    .option('--dry-run', 'Show what would be fixed without making changes')
    .action(async (options) => {
      const spinner = ora('Scanning for issues...').start();

      try {
        // Scan for issues
        const issues = await scanForIssues();
        spinner.succeed('Scan complete');

        if (issues.length === 0) {
          console.log(chalk.green('✨ No issues found!'));
          return;
        }

        // Group issues by type
        const groupedIssues = groupIssues(issues);
        displayIssues(groupedIssues);

        // If not auto-yes, confirm fixes
        if (!options.yes) {
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want to fix these issues?',
            default: false
          }]);

          if (!confirm) {
            console.log(chalk.yellow('Fix cancelled'));
            return;
          }
        }

        // Apply fixes
        if (!options.dryRun) {
          await applyFixes(groupedIssues, options);
        } else {
          displayProposedFixes(groupedIssues);
        }

      } catch (error) {
        spinner.fail('Error fixing dependencies');
        logger.error('Fix failed:', error);
        process.exit(1);
      }
    });
}

async function scanForIssues() {
  const issues = [];
  
  // Scan for outdated packages
  const outdated = await execPromise('npm outdated --json')
    .then(({ stdout }) => JSON.parse(stdout))
    .catch(() => ({}));

  Object.entries(outdated).forEach(([name, info]) => {
    issues.push({
      type: 'outdated',
      package: name,
      currentVersion: info.current,
      latestVersion: info.latest,
      updateType: determineUpdateType(info.current, info.latest)
    });
  });

  // Scan for security vulnerabilities
  const audit = await execPromise('npm audit --json')
    .then(({ stdout }) => JSON.parse(stdout))
    .catch(() => ({ vulnerabilities: {} }));

  Object.entries(audit.vulnerabilities || {}).forEach(([name, info]) => {
    issues.push({
      type: 'security',
      package: name,
      severity: info.severity,
      vulnerable_versions: info.range,
      fix_available: info.fixAvailable
    });
  });

  return issues;
}

function groupIssues(issues) {
  return issues.reduce((groups, issue) => {
    const { type } = issue;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(issue);
    return groups;
  }, {});
}

function displayIssues(groupedIssues) {
  console.log('\nFound issues:');

  if (groupedIssues.security) {
    console.log(chalk.red('\n🔒 Security Vulnerabilities:'));
    groupedIssues.security.forEach(issue => {
      console.log(chalk.red(`  ■ ${issue.package}: ${issue.severity} severity`));
    });
  }

  if (groupedIssues.outdated) {
    console.log(chalk.yellow('\n📦 Outdated Packages:'));
    groupedIssues.outdated.forEach(issue => {
      console.log(chalk.yellow(
        `  ■ ${issue.package}: ${issue.currentVersion} → ${issue.latestVersion}`
      ));
    });
  }
}

async function applyFixes(groupedIssues, options) {
  const spinner = ora('Applying fixes...').start();
  const fixes = [];

  try {
    // Fix security issues
    if (groupedIssues.security && (!options.outdated)) {
      const securityFixes = groupedIssues.security
        .filter(issue => issue.fix_available)
        .map(issue => issue.package);

      if (securityFixes.length > 0) {
        await execPromise(`npm audit fix --force`);
        fixes.push(`Fixed ${securityFixes.length} security issues`);
      }
    }

    // Fix outdated packages
    if (groupedIssues.outdated && (!options.security)) {
      const outdatedFixes = groupedIssues.outdated
        .filter(issue => ['patch', 'minor'].includes(issue.updateType))
        .map(issue => issue.package);

      if (outdatedFixes.length > 0) {
        await execPromise(`npm update ${outdatedFixes.join(' ')}`);
        fixes.push(`Updated ${outdatedFixes.length} packages`);
      }
    }

    spinner.succeed('Fixes applied successfully');
    fixes.forEach(fix => console.log(chalk.green(`✓ ${fix}`)));

  } catch (error) {
    spinner.fail('Error applying fixes');
    logger.error('Fix application failed:', error);
    process.exit(1);
  }
}

function displayProposedFixes(groupedIssues) {
  console.log('\nProposed fixes:');

  if (groupedIssues.security) {
    const fixableSecurityIssues = groupedIssues.security.filter(i => i.fix_available);
    if (fixableSecurityIssues.length > 0) {
      console.log(chalk.blue('\nWill fix security issues:'));
      fixableSecurityIssues.forEach(issue => {
        console.log(chalk.blue(`  ■ ${issue.package}: Apply security patch`));
      });
    }
  }

  if (groupedIssues.outdated) {
    const safeUpdates = groupedIssues.outdated.filter(i => ['patch', 'minor'].includes(i.updateType));
    if (safeUpdates.length > 0) {
      console.log(chalk.blue('\nWill update packages:'));
      safeUpdates.forEach(issue => {
        console.log(chalk.blue(
          `  ■ ${issue.package}: ${issue.currentVersion} → ${issue.latestVersion}`
        ));
      });
    }
  }
}

function determineUpdateType(current, latest) {
  const [currentMajor, currentMinor] = current.split('.');
  const [latestMajor, latestMinor] = latest.split('.');

  if (currentMajor !== latestMajor) return 'major';
  if (currentMinor !== latestMinor) return 'minor';
  return 'patch';
}

module.exports = fixCommand; 