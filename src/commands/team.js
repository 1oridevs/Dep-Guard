const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const teamManager = require('../core/managers/team-manager');
const logger = require('../utils/logger');

function teamCommand(program) {
  program
    .command('team')
    .description('Manage team collaboration settings')
    .option('init', 'Initialize team configuration')
    .option('add', 'Add a team member')
    .option('remove', 'Remove a team member')
    .option('list', 'List team members')
    .option('config', 'Update team configuration')
    .action(async (cmd) => {
      const spinner = ora('Managing team settings...').start();

      try {
        if (cmd.init) {
          await teamManager.initialize();
          spinner.succeed('Team configuration initialized');
          return;
        }

        if (cmd.add) {
          spinner.stop();
          const member = await promptNewMember();
          spinner.start('Adding team member...');
          await teamManager.addMember(member);
          spinner.succeed(`Added ${member.name} to the team`);
          return;
        }

        if (cmd.remove) {
          spinner.stop();
          const { email } = await promptMemberRemoval();
          spinner.start('Removing team member...');
          await teamManager.removeMember(email);
          spinner.succeed(`Removed team member: ${email}`);
          return;
        }

        if (cmd.list) {
          const config = await teamManager.getConfig();
          spinner.stop();
          
          console.log('\n' + chalk.bold('Team Members:'));
          config.team.members.forEach(member => {
            console.log(chalk.cyan(`\n${member.name} (${member.email})`));
            console.log(`  Role: ${member.role}`);
            console.log(`  Added: ${member.addedAt}`);
          });
          return;
        }

        if (cmd.config) {
          spinner.stop();
          const updates = await promptConfigUpdates();
          spinner.start('Updating team configuration...');
          await teamManager.updateConfig(updates);
          spinner.succeed('Team configuration updated');
          return;
        }

        // Show help if no option specified
        program.help();

      } catch (error) {
        spinner.fail('Team management failed');
        logger.error('Team error:', error);
        process.exit(1);
      }
    });
}

async function promptNewMember() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Enter member name:'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Enter member email:'
    },
    {
      type: 'list',
      name: 'role',
      message: 'Select member role:',
      choices: ['admin', 'developer', 'reviewer']
    }
  ]);

  return {
    ...answers,
    addedAt: new Date().toISOString()
  };
}

async function promptMemberRemoval() {
  const config = await teamManager.getConfig();
  const choices = config.team.members.map(m => ({
    name: `${m.name} (${m.email})`,
    value: m.email
  }));

  return inquirer.prompt([
    {
      type: 'list',
      name: 'email',
      message: 'Select member to remove:',
      choices
    }
  ]);
}

async function promptConfigUpdates() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'slack',
      message: 'Slack webhook URL (leave empty to skip):'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email notification settings (leave empty to skip):'
    },
    {
      type: 'number',
      name: 'approvals',
      message: 'Required number of approvals:',
      default: 1
    },
    {
      type: 'confirm',
      name: 'autoAssign',
      message: 'Enable automatic reviewer assignment?',
      default: true
    }
  ]);
}

module.exports = teamCommand; 