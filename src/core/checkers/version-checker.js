const semver = require('semver');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

class VersionChecker {
  constructor() {
    this.cache = cache;
  }

  async check() {
    try {
      const outdated = await this.getOutdatedPackages();
      const updates = this.categorizeUpdates(outdated);
      return {
        ...updates,
        summary: this.generateSummary(updates)
      };
    } catch (error) {
      logger.error('Version check failed:', error);
      return {
        major: [],
        minor: [],
        patch: [],
        summary: { total: 0, major: 0, minor: 0, patch: 0 }
      };
    }
  }

  async getOutdatedPackages() {
    try {
      const { stdout } = await execPromise('npm outdated --json');
      return JSON.parse(stdout);
    } catch (error) {
      if (error.stdout) {
        return JSON.parse(error.stdout);
      }
      return {};
    }
  }

  categorizeUpdates(outdated) {
    const updates = {
      major: [],
      minor: [],
      patch: []
    };

    Object.entries(outdated).forEach(([name, info]) => {
      const current = semver.clean(info.current);
      const latest = semver.clean(info.latest);
      const updateType = this.getUpdateType(current, latest);

      if (updateType) {
        updates[updateType].push({
          name,
          current: info.current,
          wanted: info.wanted,
          latest: info.latest,
          dependent: info.dependent,
          type: updateType
        });
      }
    });

    return updates;
  }

  getUpdateType(current, latest) {
    if (!current || !latest) return null;

    if (semver.major(latest) > semver.major(current)) {
      return 'major';
    } else if (semver.minor(latest) > semver.minor(current)) {
      return 'minor';
    } else if (semver.patch(latest) > semver.patch(current)) {
      return 'patch';
    }

    return null;
  }

  generateSummary(updates) {
    return {
      total: updates.major.length + updates.minor.length + updates.patch.length,
      major: updates.major.length,
      minor: updates.minor.length,
      patch: updates.patch.length
    };
  }

  async checkPolicy(updates, policy) {
    const violations = [];

    if (policy.version) {
      // Check major version policy
      if (policy.version.major === 'block' && updates.major.length > 0) {
        violations.push({
          type: 'version',
          level: 'high',
          message: `${updates.major.length} major version updates blocked by policy`
        });
      }

      // Check minor version policy
      if (policy.version.minor === 'block' && updates.minor.length > 0) {
        violations.push({
          type: 'version',
          level: 'medium',
          message: `${updates.minor.length} minor version updates blocked by policy`
        });
      }

      // Check specific package rules
      if (policy.version.packages) {
        for (const pkg of [...updates.major, ...updates.minor, ...updates.patch]) {
          const pkgPolicy = policy.version.packages[pkg.name];
          if (pkgPolicy && pkgPolicy.pin && pkg.latest !== pkgPolicy.pin) {
            violations.push({
              type: 'version',
              level: 'high',
              message: `Package ${pkg.name} must be pinned to version ${pkgPolicy.pin}`
            });
          }
        }
      }
    }

    return violations;
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