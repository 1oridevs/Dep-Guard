const semver = require('semver');
const logger = require('./logger');

class VersionHelper {
  compare(version1, version2) {
    try {
      return semver.compare(version1, version2);
    } catch (error) {
      logger.debug(`Failed to compare versions ${version1} and ${version2}:`, error);
      return null;
    }
  }

  isValid(version) {
    return semver.valid(version) !== null;
  }

  getUpdateType(currentVersion, newVersion) {
    if (!this.isValid(currentVersion) || !this.isValid(newVersion)) {
      return 'invalid';
    }

    if (semver.major(newVersion) > semver.major(currentVersion)) {
      return 'major';
    }
    if (semver.minor(newVersion) > semver.minor(currentVersion)) {
      return 'minor';
    }
    if (semver.patch(newVersion) > semver.patch(currentVersion)) {
      return 'patch';
    }
    return 'none';
  }

  satisfies(version, range) {
    try {
      return semver.satisfies(version, range);
    } catch (error) {
      logger.debug(`Failed to check version satisfaction ${version} against ${range}:`, error);
      return false;
    }
  }

  getLatestSatisfying(versions, range) {
    try {
      return semver.maxSatisfying(versions, range);
    } catch (error) {
      logger.debug(`Failed to find latest satisfying version for range ${range}:`, error);
      return null;
    }
  }

  sortVersions(versions, ascending = true) {
    const validVersions = versions.filter(v => this.isValid(v));
    return validVersions.sort((a, b) => {
      const comparison = this.compare(a, b);
      return ascending ? comparison : -comparison;
    });
  }
}

module.exports = new VersionHelper(); 