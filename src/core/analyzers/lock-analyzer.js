const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');
const { ValidationError } = require('../../utils/error-utils');

class LockAnalyzer {
  constructor() {
    this.cache = cache;
    this.lockFiles = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml'
    };
    this.supportedLockFiles = ['package-lock.json', 'yarn.lock'];
  }

  async analyzeLockFile(projectPath) {
    try {
      const lockFiles = await this.findLockFiles(projectPath);
      if (!lockFiles.length) {
        return null;
      }

      const packageJson = await this.readPackageJson(projectPath);
      if (!packageJson) {
        return null;
      }

      const results = await Promise.all(
        lockFiles.map(file => this.analyzeSingleLock(file, packageJson))
      );

      return {
        summary: {
          lockFiles: lockFiles.map(f => path.basename(f)),
          versionMismatches: this.mergeMismatches(results),
          totalDependencies: Object.keys(packageJson.dependencies || {}).length + 
                           Object.keys(packageJson.devDependencies || {}).length
        },
        details: results.reduce((acc, result) => ({ ...acc, ...result.details }), {})
      };
    } catch (error) {
      logger.error('Lock file analysis failed:', error);
      throw error;
    }
  }

  async findLockFiles(projectPath) {
    const files = await Promise.all(
      this.supportedLockFiles.map(async file => {
        const fullPath = path.join(projectPath, file);
        try {
          await fs.access(fullPath);
          return fullPath;
        } catch {
          return null;
        }
      })
    );
    return files.filter(Boolean);
  }

  async readPackageJson(projectPath) {
    try {
      const content = await fs.readFile(
        path.join(projectPath, 'package.json'),
        'utf8'
      );
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async analyzeSingleLock(lockFile, packageJson) {
    const fileName = path.basename(lockFile);
    const content = await fs.readFile(lockFile, 'utf8');

    if (fileName === 'yarn.lock') {
      return this.analyzeYarnLock(content, packageJson);
    }
    return this.analyzeNpmLock(content, packageJson);
  }

  async analyzeYarnLock(content, packageJson) {
    try {
      const yarnLock = yaml.load(content);
      const mismatches = [];
      const details = {};

      // Yarn v1 format
      Object.entries(yarnLock).forEach(([key, info]) => {
        const [name, requestedVersion] = key.split('@');
        if (!requestedVersion) return;

        const packageVersion = this.findPackageVersion(name, packageJson);
        if (!packageVersion) return;

        const resolvedVersion = info.version;
        details[name] = {
          requested: packageVersion,
          resolved: resolvedVersion,
          type: this.getVersionMismatchType(packageVersion, resolvedVersion)
        };

        if (!this.versionsMatch(packageVersion, resolvedVersion)) {
          mismatches.push({
            name,
            expected: packageVersion,
            actual: resolvedVersion
          });
        }
      });

      return { mismatches, details };
    } catch (error) {
      logger.error('Failed to parse yarn.lock:', error);
      throw new ValidationError('Invalid yarn.lock file');
    }
  }

  async analyzeNpmLock(content, packageJson) {
    try {
      const npmLock = JSON.parse(content);
      const mismatches = [];
      const details = {};

      Object.entries(npmLock.packages || {}).forEach(([pkgPath, info]) => {
        if (pkgPath === '') return; // Skip root package

        const name = pkgPath.split('node_modules/')[1];
        const packageVersion = this.findPackageVersion(name, packageJson);
        if (!packageVersion) return;

        const resolvedVersion = info.version;
        details[name] = {
          requested: packageVersion,
          resolved: resolvedVersion,
          type: this.getVersionMismatchType(packageVersion, resolvedVersion)
        };

        if (!this.versionsMatch(packageVersion, resolvedVersion)) {
          mismatches.push({
            name,
            expected: packageVersion,
            actual: resolvedVersion
          });
        }
      });

      return { mismatches, details };
    } catch (error) {
      logger.error('Failed to parse package-lock.json:', error);
      throw new ValidationError('Invalid package-lock.json file');
    }
  }

  findPackageVersion(name, packageJson) {
    return (packageJson.dependencies || {})[name] ||
           (packageJson.devDependencies || {})[name];
  }

  versionsMatch(expected, actual) {
    // Remove leading ^ or ~ from expected version
    const cleanExpected = expected.replace(/^[\^~]/, '');
    return cleanExpected === actual;
  }

  getVersionMismatchType(expected, actual) {
    if (this.versionsMatch(expected, actual)) return 'match';
    if (expected.startsWith('^')) return 'compatible';
    if (expected.startsWith('~')) return 'patch';
    return 'mismatch';
  }

  mergeMismatches(results) {
    return results
      .flatMap(r => r.mismatches)
      .filter((mismatch, index, array) => 
        array.findIndex(m => m.name === mismatch.name) === index
      );
  }
}

module.exports = new LockAnalyzer(); 