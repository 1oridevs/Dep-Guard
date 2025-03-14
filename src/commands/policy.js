const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs').promises;
const logger = require('../utils/logger');

async function policyCommand(program) {
  program
    .command('policy')
    .description('Manage dependency policies')
    .option('init', 'Create a new policy file')
    .option('check', 'Check compliance with current policy')
    .option('add <rule>', 'Add a new policy rule')
    .option('remove <rule>', 'Remove a policy rule')
    .option('list', 'List all policy rules')
    .option('--format <type>', 'Output format (table|json)', 'table')
    .action(async (cmd) => {
      try {
        if (cmd.init) {
          await initializePolicy();
        } else if (cmd.check) {
          await checkPolicy();
        } else if (cmd.add) {
          await addPolicyRule(cmd.add);
        } else if (cmd.remove) {
          await removePolicyRule(cmd.remove);
        } else if (cmd.list) {
          await listPolicyRules(cmd.format);
        } else {
          program.help();
        }
      } catch (error) {
        logger.error('Policy command failed:', error);
        process.exit(1);
      }
    });
}

async function initializePolicy() {
  const questions = [
    {
      type: 'checkbox',
      name: 'policyTypes',
      message: 'Select policy types to configure:',
      choices: [
        { name: 'Security policies', value: 'security', checked: true },
        { name: 'License policies', value: 'license', checked: true },
        { name: 'Version policies', value: 'version', checked: true },
        { name: 'Size policies', value: 'size', checked: false }
      ]
    },
    {
      type: 'list',
      name: 'securityLevel',
      message: 'Default security level:',
      choices: ['strict', 'moderate', 'relaxed'],
      when: (answers) => answers.policyTypes.includes('security')
    },
    // ... more policy questions ...
  ];

  const answers = await inquirer.prompt(questions);
  const policy = generatePolicyFromAnswers(answers);
  await savePolicyFile(policy);
}

async function checkPolicy() {
  const spinner = ora('Checking policy compliance...').start();
  
  try {
    const policy = await loadPolicyFile();
    const violations = await checkPolicyCompliance(policy);
    
    spinner.succeed('Policy check complete');
    
    if (violations.length > 0) {
      console.log(chalk.red('\nPolicy violations found:'));
      violations.forEach(v => {
        console.log(chalk.red(`■ ${v.type}: ${v.message}`));
      });
      process.exit(1);
    } else {
      console.log(chalk.green('\n✓ All policies are satisfied'));
    }
  } catch (error) {
    spinner.fail('Policy check failed');
    throw error;
  }
}

async function addPolicyRule(rule) {
  try {
    const policy = await loadPolicyFile();
    const [type, ...ruleParts] = rule.split(':');
    const ruleContent = ruleParts.join(':');

    switch (type) {
      case 'security':
        await addSecurityRule(policy, ruleContent);
        break;
      case 'license':
        await addLicenseRule(policy, ruleContent);
        break;
      case 'version':
        await addVersionRule(policy, ruleContent);
        break;
      case 'size':
        await addSizeRule(policy, ruleContent);
        break;
      default:
        throw new Error(`Unknown policy type: ${type}`);
    }

    await savePolicyFile(policy);
    console.log(chalk.green(`✓ Added ${type} rule: ${ruleContent}`));
  } catch (error) {
    throw new Error(`Failed to add policy rule: ${error.message}`);
  }
}

async function removePolicyRule(rule) {
  try {
    const policy = await loadPolicyFile();
    const [type, id] = rule.split(':');

    let removed = false;
    if (policy[type] && policy[type].rules) {
      policy[type].rules = policy[type].rules.filter(r => r.id !== id);
      removed = true;
    }

    if (removed) {
      await savePolicyFile(policy);
      console.log(chalk.green(`✓ Removed ${type} rule: ${id}`));
    } else {
      console.log(chalk.yellow(`Rule not found: ${type}:${id}`));
    }
  } catch (error) {
    throw new Error(`Failed to remove policy rule: ${error.message}`);
  }
}

async function listPolicyRules(format) {
  try {
    const policy = await loadPolicyFile();
    
    if (format === 'json') {
      console.log(JSON.stringify(policy, null, 2));
      return;
    }

    // Display as table
    console.log('\nCurrent Policy Rules:\n');
    Object.entries(policy).forEach(([type, config]) => {
      console.log(chalk.blue(`\n${type.toUpperCase()} RULES:`));
      if (config.rules && config.rules.length > 0) {
        config.rules.forEach(rule => {
          console.log(chalk.cyan(`■ [${rule.id}] ${rule.description}`));
          if (rule.conditions) {
            Object.entries(rule.conditions).forEach(([key, value]) => {
              console.log(`  - ${key}: ${value}`);
            });
          }
        });
      } else {
        console.log(chalk.gray('  No rules configured'));
      }
    });
  } catch (error) {
    throw new Error(`Failed to list policy rules: ${error.message}`);
  }
}

async function loadPolicyFile() {
  try {
    const content = await fs.readFile('.dependency-guardian-policy.json', 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('No policy file found. Run "dependency-guardian policy init" to create one.');
    }
    throw error;
  }
}

async function savePolicyFile(policy) {
  await fs.writeFile(
    '.dependency-guardian-policy.json',
    JSON.stringify(policy, null, 2)
  );
}

function generatePolicyFromAnswers(answers) {
  return {
    security: answers.policyTypes.includes('security') ? {
      level: answers.securityLevel,
      rules: getDefaultSecurityRules(answers.securityLevel)
    } : undefined,
    license: answers.policyTypes.includes('license') ? {
      rules: getDefaultLicenseRules()
    } : undefined,
    version: answers.policyTypes.includes('version') ? {
      rules: getDefaultVersionRules()
    } : undefined,
    size: answers.policyTypes.includes('size') ? {
      rules: getDefaultSizeRules()
    } : undefined
  };
}

// Helper functions for specific rule types
function getDefaultSecurityRules(level) {
  const rules = {
    strict: [
      { id: 'sec001', description: 'No critical vulnerabilities', severity: 'critical', action: 'block' },
      { id: 'sec002', description: 'No high vulnerabilities', severity: 'high', action: 'block' }
    ],
    moderate: [
      { id: 'sec001', description: 'No critical vulnerabilities', severity: 'critical', action: 'block' },
      { id: 'sec002', description: 'High vulnerabilities require review', severity: 'high', action: 'warn' }
    ],
    relaxed: [
      { id: 'sec001', description: 'Critical vulnerabilities require review', severity: 'critical', action: 'warn' }
    ]
  };
  
  return rules[level] || rules.moderate;
}

// ... similar helper functions for other rule types ...

module.exports = policyCommand;