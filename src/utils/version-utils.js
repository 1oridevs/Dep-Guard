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
    if (!version) return null;

    // Remove caret/tilde and clean the version
    const cleanVersion = version.replace(/^[\^~]/, '');
    const parsed = semver.parse(cleanVersion);

    if (parsed) {
      return {
        version: cleanVersion,
        isPreRelease: this.isPreRelease(cleanVersion),
        type: 'semver'
      };
    }

    // Try non-semver patterns
    for (const pattern of this.nonSemverPatterns) {
      const match = cleanVersion.match(pattern);
      if (match) {
        return {
          version: match[0],
          isPreRelease: false,
          type: 'non-semver'
        };
      }
    }

    logger.debug(`Unable to parse version: ${version}`);
    return null;
  }

  isPreRelease(version) {
    const parsed = semver.parse(version);
    if (!parsed) return false;
    return parsed.prerelease.length > 0 || 
           this.preReleaseIdentifiers.some(id => 
             version.toLowerCase().includes(id)
           );
  }

  compareVersions(v1, v2) {
    const parsed1 = this.parseVersion(v1);
    const parsed2 = this.parseVersion(v2);

    if (!parsed1 || !parsed2) return null;

    // If both are semver, use semver comparison
    if (parsed1.type === 'semver' && parsed2.type === 'semver') {
      return semver.compare(parsed1.version, parsed2.version);
    }

    // For non-semver, try to convert to comparable format
    const normalized1 = this.normalizeVersion(parsed1.version);
    const normalized2 = this.normalizeVersion(parsed2.version);

    if (normalized1 === normalized2) return 0;
    return normalized1 > normalized2 ? 1 : -1;
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
    if (!currentVersion || !latestVersion) {
      return 'unknown';
    }

    // Remove caret/tilde
    const current = this.parseVersion(currentVersion);
    const latest = this.parseVersion(latestVersion);

    if (!current || !latest) {
      return 'unknown';
    }

    try {
      if (semver.eq(current.version, latest.version)) {
        return 'current';
      }

      if (semver.gt(latest.version, current.version)) {
        if (semver.major(latest.version) > semver.major(current.version)) {
          return 'major';
        }
        if (semver.minor(latest.version) > semver.minor(current.version)) {
          return 'minor';
        }
        if (semver.patch(latest.version) > semver.patch(current.version)) {
          return 'patch';
        }
      }

      return 'current';
    } catch (error) {
      logger.debug(`Error determining update type: ${error.message}`);
      return 'unknown';
    }
  }
}

module.exports = new VersionUtils(); 