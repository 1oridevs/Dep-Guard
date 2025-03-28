const teamManager = require('../../../../src/core/managers/team-manager');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const axios = require('axios');

jest.mock('fs').promises;
jest.mock('axios');
jest.mock('@octokit/rest');

describe('TeamManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with config', async () => {
      const config = {
        github: { token: 'test-token' },
        notifications: {
          slack: 'https://slack.webhook',
          discord: 'https://discord.webhook'
        }
      };

      const result = await teamManager.initialize(config);
      expect(result).toBe(true);
      expect(teamManager.slackWebhook).toBe(config.notifications.slack);
      expect(teamManager.discordWebhook).toBe(config.notifications.discord);
    });
  });

  describe('createUpdateRequest', () => {
    it('should create and notify about update request', async () => {
      const update = {
        package: 'test-pkg',
        version: '2.0.0',
        type: 'major',
        impact: { score: 80 }
      };

      const request = await teamManager.createUpdateRequest(update);
      
      expect(request.id).toBeDefined();
      expect(request.status).toBe('pending');
      expect(request.requiredApprovals).toBe(2); // Major updates require 2 approvals
    });
  });

  describe('approveUpdate', () => {
    it('should approve and update status when enough approvals', async () => {
      const requestId = 'TEST-1';
      const mockRequest = {
        id: requestId,
        requiredApprovals: 2,
        approvals: [],
        status: 'pending'
      };

      teamManager.getRequest = jest.fn().mockResolvedValue(mockRequest);
      
      const result = await teamManager.approveUpdate(requestId, 'user1');
      expect(result.approvals).toHaveLength(1);

      const result2 = await teamManager.approveUpdate(requestId, 'user2');
      expect(result2.status).toBe('approved');
    });
  });
}); 