const inquirer = require('inquirer');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const logger = require('../utils/logger');

async function initCommand(program) {
  program
    .command('init')
    .description('Initialize dependency-guardian configuration')
    .option('--force', 'Overwrite existing configuration')
    .action(async (options) => {
      try {
        const config = await promptConfiguration();
        await saveConfiguration(config, options.force);
        console.log(chalk.green('✓ Configuration created successfully'));
      } catch (error) {
        logger.error('Init failed:', error);
        process.exit(1);
      }
    });
}

async function promptConfiguration() {
  const questions = [
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: path.basename(process.cwd())
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select features to enable:',
      choices: [
        { name: 'Security scanning', value: 'security', checked: true },
        { name: 'License compliance', value: 'license', checked: true },
        { name: 'Dependency updates', value: 'updates', checked: true },
        { name: 'Bundle size analysis', value: 'bundle', checked: false }
      ]
    },
    {
      type: 'list',
      name: 'securityLevel',
      message: 'Minimum security issue level:',
      choices: ['low', 'moderate', 'high', 'critical'],
      default: 'low',
      when: answers => answers.features.includes('security')
    },
    {
      type: 'checkbox',
      name: 'allowedLicenses',
      message: 'Select allowed licenses:',
      choices: [
        { name: 'MIT', checked: true },
        { name: 'ISC', checked: true },
        { name: 'Apache-2.0', checked: true },
        { name: 'BSD-3-Clause', checked: true }
      ],
      when: answers => answers.features.includes('license')
    },
    {
      type: 'confirm',
      name: 'createGitHubWorkflow',
      message: 'Create GitHub Actions workflow?',
      default: true
    }
  ];

  return inquirer.prompt(questions);
}

async function saveConfiguration(config, force = false) {
  const configPath = '.dependency-guardianrc.json';
  
  try {
    // Check if config exists
    if (!force) {
      try {
        await fs.access(configPath);
        const { overwrite } = await inquirer.prompt([{
          type: 'confirm',
          name: 'overwrite',
          message: 'Configuration file already exists. Overwrite?',
          default: false
        }]);

        if (!overwrite) {
          console.log(chalk.yellow('Configuration creation cancelled'));
          return;
        }
      } catch (e) {
        // File doesn't exist, continue
      }
    }

    // Transform answers to configuration
    const configuration = {
      features: config.features.reduce((acc, feature) => {
        acc[feature] = true;
        return acc;
      }, {}),
      security: config.features.includes('security') ? {
        minSeverity: config.securityLevel,
        autofix: false,
        ignorePaths: []
      } : undefined,
      license: config.features.includes('license') ? {
        allowed: config.allowedLicenses,
        forbidden: [],
        unknown: 'warn'
      } : undefined,
      updates: config.features.includes('updates') ? {
        checkFrequency: 'weekly',
        autoUpdate: false,
        ignorePackages: []
      } : undefined,
      bundle: config.features.includes('bundle') ? {
        maxSize: '1MB',
        warnSize: '500KB'
      } : undefined
    };

    // Save configuration
    await fs.writeFile(configPath, JSON.stringify(configuration, null, 2));

    // Create GitHub workflow if requested
    if (config.createGitHubWorkflow) {
      await createGitHubWorkflow();
    }

  } catch (error) {
    throw new Error(`Failed to save configuration: ${error.message}`);
  }
}

async function createGitHubWorkflow() {
  const workflowDir = '.github/workflows';
  const workflowPath = `${workflowDir}/dependency-guardian.yml`;

  try {
    // Create workflow directory
    await fs.mkdir(workflowDir, { recursive: true });

    // Create workflow file
    const workflow = `name: Dependency Guardian

on:
  push:
    paths:
      - 'package.json'
      - 'package-lock.json'
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Run Dependency Guardian
        run: npx dependency-guardian ci
`;

    await fs.writeFile(workflowPath, workflow);
    console.log(chalk.green(`✓ Created GitHub workflow at ${workflowPath}`));

  } catch (error) {
    logger.error('Failed to create GitHub workflow:', error);
  }
}

module.exports = initCommand; 