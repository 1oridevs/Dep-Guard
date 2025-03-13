const logger = require('./logger');

class CIHelper {
  constructor() {
    this.environment = this.detectEnvironment();
  }

  detectEnvironment() {
    if (process.env.GITHUB_ACTIONS) {
      return 'github';
    }
    if (process.env.GITLAB_CI) {
      return 'gitlab';
    }
    if (process.env.JENKINS_URL) {
      return 'jenkins';
    }
    if (process.env.TRAVIS) {
      return 'travis';
    }
    if (process.env.CIRCLECI) {
      return 'circle';
    }
    return 'unknown';
  }

  isCI() {
    return this.environment !== 'unknown';
  }

  async createComment(report) {
    try {
      switch (this.environment) {
        case 'github':
          await this.createGithubComment(report);
          break;
        case 'gitlab':
          await this.createGitlabComment(report);
          break;
        default:
          logger.debug('Comment creation not supported in current environment');
      }
    } catch (error) {
      logger.error('Failed to create CI comment:', error);
    }
  }

  async createGithubComment(report) {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN not set');
    }

    const context = {
      owner: process.env.GITHUB_REPOSITORY_OWNER,
      repo: process.env.GITHUB_REPOSITORY.split('/')[1],
      issue_number: process.env.GITHUB_PR_NUMBER
    };

    // Implementation depends on @actions/github or similar
  }

  async createGitlabComment(report) {
    if (!process.env.GITLAB_TOKEN) {
      throw new Error('GITLAB_TOKEN not set');
    }

    // Implementation depends on gitlab API client
  }

  getPullRequestInfo() {
    switch (this.environment) {
      case 'github':
        return {
          number: process.env.GITHUB_PR_NUMBER,
          branch: process.env.GITHUB_HEAD_REF,
          base: process.env.GITHUB_BASE_REF
        };
      case 'gitlab':
        return {
          number: process.env.CI_MERGE_REQUEST_IID,
          branch: process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME,
          base: process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME
        };
      default:
        return null;
    }
  }
}

module.exports = new CIHelper(); 