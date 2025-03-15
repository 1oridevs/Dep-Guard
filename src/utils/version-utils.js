const semver = require('semver');
const logger = require('./logger');

class VersionUtils {
  constructor() {
    this.preReleaseIdentifiers = ['alpha', 'beta', 'rc', 'next', 'preview'];
    this.nonSemverPatterns = [
      /^[vV]?(\d+)$/,                    // v1, 1
      /^[vV]?(\d+\.\d+)$/,              // v1.2, 1.2
      /^[vV]?(\d+\.\d+\.\d+)$/,         // v1.2.3, 1.2.3
      /^[vV]?(\d+\.\d+\.\d+\.\d+)$/,    // v1.2.3.4, 1.2.3.4
      /^(\d{8}|\d{14})$/,               // Date-based versions
      /^latest|stable|current$/          // Special keywords
    ];
  }

  parseVersion(version) {
    try {
      // Remove any leading ^ or ~
      const cleanVersion = version.replace(/^[\^~]/, '');
      
      if (!semver.valid(cleanVersion)) {
        return null;
      }

      return {
        version: cleanVersion,
        isPreRelease: Boolean(semver.prerelease(cleanVersion)),
        type: 'semver'
      };
    } catch (error) {
      return null;
    }
  }

  isPreRelease(version) {
    const parsed = semver.parse(version);
    if (!parsed) return false;
    return parsed.prerelease.length > 0 || 
           this.preReleaseIdentifiers.some(id => 
             version.toLowerCase().includes(id)
           );
  }

  compareVersions(version1, version2) {
    return semver.compare(version1, version2);
  }

  normalizeVersion(version) {
    // Remove leading 'v' or 'V'
    version = version.replace(/^[vV]/, '');

    // Pad version parts with zeros
    const parts = version.split('.');
    while (parts.length < 4) {
      parts.push('0');
    }

    return parts.map(p => p.padStart(5, '0')).join('.');
  }

  determineUpdateType(currentVersion, latestVersion) {
    try {
      const current = semver.clean(currentVersion);
      const latest = semver.clean(latestVersion);

      if (!current || !latest) {
        return 'unknown';
      }

      if (current === latest) {
        return 'current';
      }

      if (semver.major(latest) > semver.major(current)) {
        return 'major';
      }

      if (semver.minor(latest) > semver.minor(current)) {
        return 'minor';
      }

      if (semver.patch(latest) > semver.patch(current)) {
        return 'patch';
      }

      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  isValidVersion(version) {
    return Boolean(semver.valid(version));
  }

  satisfies(version, range) {
    return semver.satisfies(version, range);
  }
}

class VersionChecker {
  constructor() {
    this.updateTypes = {
      MAJOR: 'major',
      MINOR: 'minor',
      PATCH: 'patch',
      NONE: 'none'
    };
  }

  getUpdateType(currentVersion, latestVersion) {
    try {
      if (!semver.valid(currentVersion) || !semver.valid(latestVersion)) {
        throw new Error('Invalid version format');
      }

      if (semver.gt(latestVersion, currentVersion)) {
        if (semver.major(latestVersion) > semver.major(currentVersion)) {
          return this.updateTypes.MAJOR;
        }
        if (semver.minor(latestVersion) > semver.minor(currentVersion)) {
          return this.updateTypes.MINOR;
        }
        if (semver.patch(latestVersion) > semver.patch(currentVersion)) {
          return this.updateTypes.PATCH;
        }
      }
      return this.updateTypes.NONE;
    } catch (error) {
      logger.error('Version comparison failed:', error);
      throw error;
    }
  }

  isUpdateSafe(currentVersion, newVersion) {
    const updateType = this.getUpdateType(currentVersion, newVersion);
    return updateType === this.updateTypes.PATCH || updateType === this.updateTypes.MINOR;
  }

  getSafeUpdate(currentVersion, availableVersions) {
    try {
      const validVersions = availableVersions
        .filter(v => semver.valid(v))
        .sort(semver.rcompare);

      return validVersions.find(version => 
        this.isUpdateSafe(currentVersion, version)
      ) || currentVersion;
    } catch (error) {
      logger.error('Safe update check failed:', error);
      return currentVersion;
    }
  }

  formatUpdateType(type) {
    const colors = {
      [this.updateTypes.MAJOR]: 'red',
      [this.updateTypes.MINOR]: 'yellow',
      [this.updateTypes.PATCH]: 'green',
      [this.updateTypes.NONE]: 'blue'
    };

    return {
      type,
      color: colors[type] || 'white',
      isSafe: type === this.updateTypes.PATCH || type === this.updateTypes.MINOR
    };
  }
}

module.exports = {
  VersionUtils: new VersionUtils(),
  VersionChecker: new VersionChecker()
}; 