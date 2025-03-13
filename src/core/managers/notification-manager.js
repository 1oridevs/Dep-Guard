const axios = require('axios');
const nodemailer = require('nodemailer');
const { Octokit } = require('@octokit/rest');
const logger = require('../../utils/logger');
const cache = require('./cache-manager');

class NotificationManager {
  constructor() {
    this.cache = cache;
    this.octokit = null;
    this.mailer = null;
  }

  async notify(type, data, config) {
    try {
      switch (type) {
        case 'slack':
          await this.sendSlackNotification(data, config.slack);
          break;
        case 'email':
          await this.sendEmailNotification(data, config.email);
          break;
        case 'github':
          await this.createGithubIssue(data, config.github);
          break;
        default:
          logger.warn(`Unknown notification type: ${type}`);
      }
    } catch (error) {
      logger.error(`Failed to send ${type} notification:`, error);
    }
  }

  async sendSlackNotification(data, config) {
    if (!config?.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const message = this.formatSlackMessage(data);
    await axios.post(config.webhookUrl, message);
  }

  async sendEmailNotification(data, config) {
    if (!this.mailer) {
      this.mailer = nodemailer.createTransport(config.smtp);
    }

    const message = this.formatEmailMessage(data);
    await this.mailer.sendMail({
      from: config.from,
      to: config.to,
      subject: 'Dependency Guardian Report',
      html: message
    });
  }

  async createGithubIssue(data, config) {
    if (!this.octokit) {
      this.octokit = new Octokit({
        auth: config.token
      });
    }

    const issueBody = this.formatGithubIssue(data);
    await this.octokit.issues.create({
      owner: config.owner,
      repo: config.repo,
      title: 'Dependency Guardian Report',
      body: issueBody,
      labels: ['dependencies']
    });
  }

  formatSlackMessage(data) {
    return {
      text: 'Dependency Guardian Report',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📦 Dependency Guardian Report'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: this.formatSummary(data)
          }
        }
      ]
    };
  }

  formatEmailMessage(data) {
    return `
      <h1>Dependency Guardian Report</h1>
      <p>Generated on: ${new Date().toISOString()}</p>
      ${this.formatSummaryHTML(data)}
    `;
  }

  formatGithubIssue(data) {
    return `
# Dependency Guardian Report

Generated on: ${new Date().toISOString()}

${this.formatSummaryMarkdown(data)}
    `;
  }

  formatSummary(data) {
    // Implementation depends on data structure
    return JSON.stringify(data, null, 2);
  }

  formatSummaryHTML(data) {
    // Implementation depends on data structure
    return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  }

  formatSummaryMarkdown(data) {
    // Implementation depends on data structure
    return '```json\n' + JSON.stringify(data, null, 2) + '\n```';
  }
}

module.exports = new NotificationManager(); 