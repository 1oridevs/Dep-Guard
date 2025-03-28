const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

class TeamManager {
  constructor() {
    this.configPath = '.depguard/team.yml';
    this.cache = cache;
    this.octokit = null;
    this.slackWebhook = null;
    this.discordWebhook = null;
  }

  async initialize(config) {
    try {
      this.config = await this.loadConfig();
      
      // Initialize integrations
      if (config.github?.token) {
        this.octokit = new Octokit({ auth: config.github.token });
      }
      
      this.slackWebhook = config.notifications?.slack;
      this.discordWebhook = config.notifications?.discord;
      
      // Set up approval workflows
      this.approvalWorkflows = this.setupApprovalWorkflows(config.approvals);
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize team manager:', error);
      return false;
    }
  }

  async createUpdateRequest(update) {
    const request = {
      id: `UPDATE-${Date.now()}`,
      package: update.package,
      version: update.version,
      type: update.type,
      impact: update.impact,
      requiredApprovals: this.getRequiredApprovals(update),
      approvals: [],
      status: 'pending',
      created: new Date(),
      notifications: []
    };

    await this.saveRequest(request);
    await this.notifyTeam(request);
    
    return request;
  }

  async approveUpdate(requestId, approver, comments = '') {
    const request = await this.getRequest(requestId);
    if (!request) {
      throw new Error('Update request not found');
    }

    const approval = {
      approver,
      timestamp: new Date(),
      comments
    };

    request.approvals.push(approval);
    
    if (request.approvals.length >= request.requiredApprovals) {
      request.status = 'approved';
      await this.notifyApproval(request);
    }

    await this.saveRequest(request);
    return request;
  }

  async notifyTeam(message) {
    const notifications = [];

    if (this.slackWebhook) {
      try {
        await axios.post(this.slackWebhook, this.formatSlackMessage(message));
        notifications.push('slack');
      } catch (error) {
        logger.error('Failed to send Slack notification:', error);
      }
    }

    if (this.discordWebhook) {
      try {
        await axios.post(this.discordWebhook, this.formatDiscordMessage(message));
        notifications.push('discord');
      } catch (error) {
        logger.error('Failed to send Discord notification:', error);
      }
    }

    if (this.octokit) {
      try {
        await this.createGitHubIssue(message);
        notifications.push('github');
      } catch (error) {
        logger.error('Failed to create GitHub issue:', error);
      }
    }

    return notifications;
  }

  getRequiredApprovals(update) {
    const workflow = this.approvalWorkflows.find(w => 
      w.type === update.type || 
      w.impact >= update.impact.score
    );

    return workflow?.requiredApprovals || 1;
  }

  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      logger.warn('No team configuration found, using defaults');
      return this.getDefaultConfig();
    }
  }

  setupApprovalWorkflows(config) {
    return [
      {
        type: 'major',
        requiredApprovals: 2,
        autoApprove: false
      },
      {
        type: 'minor',
        requiredApprovals: 1,
        autoApprove: false
      },
      {
        type: 'patch',
        requiredApprovals: 0,
        autoApprove: true
      }
    ];
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