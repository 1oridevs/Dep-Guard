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

module.exports = new VersionUtils(); 