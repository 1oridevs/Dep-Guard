const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class TeamManager {
  constructor() {
    this.configPath = '.depguard/team.yml';
    this.cache = cache;
  }

  async initialize() {
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      
      if (!await this.exists()) {
        await this.createDefaultConfig();
      }
    } catch (error) {
      logger.error('Failed to initialize team configuration:', error);
      throw error;
    }
  }

  async exists() {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  async createDefaultConfig() {
    const defaultConfig = {
      team: {
        members: [],
        roles: {
          admin: {
            permissions: ['manage_team', 'approve_updates', 'modify_policy']
          },
          developer: {
            permissions: ['suggest_updates', 'view_reports']
          },
          reviewer: {
            permissions: ['approve_updates', 'view_reports']
          }
        },
        notifications: {
          slack: null,
          email: null,
          discord: null
        },
        approvals: {
          required: 1,
          automaticFor: ['patch']
        },
        policy: {
          autoAssign: true,
          requireTests: true,
          requireChangelog: true
        }
      }
    };

    await fs.writeFile(
      this.configPath,
      yaml.dump(defaultConfig),
      'utf8'
    );

    return defaultConfig;
  }

  async getConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      logger.error('Failed to read team configuration:', error);
      throw error;
    }
  }

  async updateConfig(updates) {
    try {
      const config = await this.getConfig();
      const newConfig = { ...config, ...updates };
      
      await fs.writeFile(
        this.configPath,
        yaml.dump(newConfig),
        'utf8'
      );

      return newConfig;
    } catch (error) {
      logger.error('Failed to update team configuration:', error);
      throw error;
    }
  }

  async addMember(member) {
    const config = await this.getConfig();
    
    if (!config.team.members.find(m => m.email === member.email)) {
      config.team.members.push(member);
      await this.updateConfig(config);
    }
  }

  async removeMember(email) {
    const config = await this.getConfig();
    config.team.members = config.team.members.filter(m => m.email !== email);
    await this.updateConfig(config);
  }

  async assignReviewer(packageName) {
    const config = await this.getConfig();
    const reviewers = config.team.members.filter(m => 
      m.role === 'reviewer' || m.role === 'admin'
    );

    if (reviewers.length === 0) {
      throw new Error('No eligible reviewers found');
    }

    // Simple round-robin assignment
    const reviewer = reviewers[Math.floor(Math.random() * reviewers.length)];
    return reviewer;
  }

  async notifyTeam(message, options = {}) {
    const config = await this.getConfig();
    const notifications = config.team.notifications;

    if (notifications.slack) {
      await this.sendSlackNotification(notifications.slack, message);
    }

    if (notifications.email) {
      await this.sendEmailNotification(notifications.email, message);
    }

    if (notifications.discord) {
      await this.sendDiscordNotification(notifications.discord, message);
    }
  }

  // Notification methods implementation...
  async sendSlackNotification(webhook, message) {
    // TODO: Implement Slack notification
  }

  async sendEmailNotification(config, message) {
    // TODO: Implement email notification
  }

  async sendDiscordNotification(webhook, message) {
    // TODO: Implement Discord notification
  }
}

module.exports = new TeamManager(); 