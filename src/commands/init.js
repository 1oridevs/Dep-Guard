const { Command } = require('commander');
const inquirer = require('inquirer');
const fs = require('fs/promises');
const path = require('path');
const chalk = require('chalk');
const logger = require('../utils/logger');

function initCommand(program) {
  program
    .command('init')
    .description('Interactively initialize Dependency Guardian configuration')
    .action(async () => {
      try {
        const config = await promptConfiguration();
        await saveConfiguration(config);
      } catch (error) {
        logger.error('Failed to initialize configuration:', error);
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
        { name: 'Version control', value: 'version', checked: true },
        { name: 'Bundle analysis', value: 'bundle', checked: false },
        { name: 'Dependency tree', value: 'tree', checked: true }
      ]
    },
    {
      type: 'list',
      name: 'cicd',
      message: 'Configure CI/CD integration?',
      choices: [
        { name: 'Yes - GitHub Actions', value: 'github' },
        { name: 'Yes - GitLab CI', value: 'gitlab' },
        { name: 'No', value: false }
      ]
    }
  ];

  const answers = await inquirer.prompt(questions);
  return {
    name: answers.projectName,
    features: answers.features,
    cicd: answers.cicd
  };
}

async function saveConfiguration(config, force = false) {
  const configPath = path.join(process.cwd(), '.dependency-guardian.json');
  
  // Check if config exists
  try {
    await fs.access(configPath);
    if (!force) {
      throw new Error('Configuration already exists. Use --force to overwrite.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Save configuration
  await fs.writeFile(
    configPath,
    JSON.stringify({
      name: config.name,
      version: '1.0.0',
      features: config.features,
      rules: generateDefaultRules(config.features)
    }, null, 2)
  );

  // Create CI/CD configuration if selected
  if (config.cicd) {
    await createCicdConfig(config.cicd);
  }
}

function generateDefaultRules(features) {
  const rules = {};

  if (features.includes('security')) {
    rules.security = {
      maxSeverity: 'high',
      autoFix: true,
      ignorePatterns: []
    };
  }

  if (features.includes('license')) {
    rules.license = {
      allowed: ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause'],
      forbidden: ['GPL', 'AGPL'],
      unknown: 'warn'
    };
  }

  if (features.includes('version')) {
    rules.version = {
      maxAge: 365,
      allowMajor: false,
      allowMinor: true,
      allowPatch: true
    };
  }

  if (features.includes('bundle')) {
    rules.bundle = {
      maxSize: '5MB',
      warnSize: '1MB',
      checkUnused: true
    };
  }

  return rules;
}

async function createCicdConfig(type) {
  if (type === 'github') {
    await createGithubWorkflow();
  } else if (type === 'gitlab') {
    await createGitlabConfig();
  }
}

async function createGithubWorkflow() {
  const workflowDir = path.join(process.cwd(), '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'dependency-guardian.yml');

  try {
    await fs.mkdir(workflowDir, { recursive: true });

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

async function createGitlabConfig() {
  const gitlabPath = path.join(process.cwd(), '.gitlab-ci.yml');

  try {
    const config = `dependency-check:
  image: node:20
  script:
    - npm ci
    - npx dependency-guardian ci
  rules:
    - changes:
      - package.json
      - package-lock.json
    - schedule: "0 0 * * 1"  # Weekly on Monday
`;

    await fs.writeFile(gitlabPath, config);
    console.log(chalk.green(`✓ Created GitLab CI config at ${gitlabPath}`));

  } catch (error) {
    logger.error('Failed to create GitLab CI config:', error);
  }
}

module.exports = initCommand;