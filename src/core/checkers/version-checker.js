const semver = require('semver');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

class VersionChecker {
  constructor() {
    this.cache = cache;
  }

  async checkVersion(currentVersion, latestVersion, policy) {
    const issues = [];

    if (!semver.valid(currentVersion) || !semver.valid(latestVersion)) {
      issues.push({
        type: 'version',
        level: 'warning',
        message: 'Invalid version format'
      });
      return issues;
    }

    // Check version age
    const updateType = this.getUpdateType(currentVersion, latestVersion);
    if (updateType === 'major' && !policy.versioning.allowMajorUpdates) {
      issues.push({
        type: 'version',
        level: 'warning',
        message: 'Major update available but blocked by policy'
      });
    }

    // Check if update is needed based on policy
    const allowedUpdates = policy.versioning.allowedUpdateTypes || ['patch'];
    if (updateType && !allowedUpdates.includes(updateType)) {
      issues.push({
        type: 'version',
        level: 'info',
        message: `${updateType} update available`
      });
    }

    return issues;
  }

  getUpdateType(currentVersion, latestVersion) {
    if (semver.major(latestVersion) > semver.major(currentVersion)) {
      return 'major';
    }
    if (semver.minor(latestVersion) > semver.minor(currentVersion)) {
      return 'minor';
    }
    if (semver.patch(latestVersion) > semver.patch(currentVersion)) {
      return 'patch';
    }
    return null;
  }

  isUpdateAllowed(updateType, policy) {
    if (!updateType) return true;
    const allowedTypes = policy.versioning.allowedUpdateTypes || ['patch'];
    return allowedTypes.includes(updateType);
  }

  shouldAutoMerge(updateType, policy) {
    if (!updateType) return false;
    return policy.versioning.autoMerge[updateType] || false;
  }
}

module.exports = new VersionChecker(); 