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
    this.updateTypes = {
      MAJOR: 'major',
      MINOR: 'minor',
      PATCH: 'patch',
      CURRENT: 'current'
    };
  }

  parseVersion(version) {
    try {
      // Remove leading ^ or ~ if present
      const cleanVersion = version.replace(/^[\^~]/, '');
      
      // Parse the version
      const parsed = semver.parse(cleanVersion);
      if (!parsed) return null;

      return {
        version: cleanVersion,
        isPreRelease: parsed.prerelease.length > 0,
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        prerelease: parsed.prerelease,
        range: version.startsWith('^') ? 'caret' : 
               version.startsWith('~') ? 'tilde' : 'exact'
      };
    } catch (error) {
      logger.debug(`Failed to parse version: ${version}`, error);
      return null;
    }
  }

  isPreRelease(version) {
    const parsed = this.parseVersion(version);
    return parsed ? parsed.isPreRelease : false;
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

  determineUpdateType(currentVersion, newVersion) {
    try {
      if (!semver.valid(currentVersion) || !semver.valid(newVersion)) {
        throw new Error('Invalid version format');
      }

      if (semver.eq(currentVersion, newVersion)) {
        return this.updateTypes.CURRENT;
      }

      if (semver.major(newVersion) > semver.major(currentVersion)) {
        return this.updateTypes.MAJOR;
      }

      if (semver.minor(newVersion) > semver.minor(currentVersion)) {
        return this.updateTypes.MINOR;
      }

      if (semver.patch(newVersion) > semver.patch(currentVersion)) {
        return this.updateTypes.PATCH;
      }

      return this.updateTypes.CURRENT;
    } catch (error) {
      logger.error('Version comparison failed:', error);
      throw error;
    }
  }

  isValidVersion(version) {
    return Boolean(semver.valid(version));
  }

  satisfies(version, range) {
    try {
      return semver.satisfies(version, range);
    } catch (error) {
      logger.error('Version satisfaction check failed:', error);
      return false;
    }
  }

  getLatestSatisfying(versions, range) {
    try {
      return semver.maxSatisfying(versions, range);
    } catch (error) {
      logger.error('Latest satisfying version check failed:', error);
      return null;
    }
  }

  sortVersions(versions, ascending = true) {
    try {
      const sorted = versions.sort(semver.compare);
      return ascending ? sorted : sorted.reverse();
    } catch (error) {
      logger.error('Version sorting failed:', error);
      return versions;
    }
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