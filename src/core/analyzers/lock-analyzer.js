const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class LockAnalyzer {
  constructor() {
    this.cache = cache;
    this.lockFiles = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml'
    };
  }

  async analyzeLockFile(projectPath) {
    const cacheKey = `lock:${projectPath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = {
        npm: await this.analyzeNpmLock(projectPath),
        yarn: await this.analyzeYarnLock(projectPath),
        pnpm: await this.analyzePnpmLock(projectPath),
        summary: {
          versionMismatches: [],
          duplicates: [],
          outdated: []
        }
      };

      // Analyze version mismatches and duplicates
      this.analyzeMismatches(result);
      
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('Lock file analysis failed:', error);
      throw error;
    }
  }

  async analyzeNpmLock(projectPath) {
    try {
      const lockPath = path.join(projectPath, this.lockFiles.npm);
      const content = await fs.readFile(lockPath, 'utf8');
      const lockfile = JSON.parse(content);

      return {
        version: lockfile.lockfileVersion || 1,
        dependencies: this.flattenNpmDependencies(lockfile.dependencies || {})
      };
    } catch (error) {
      logger.debug(`No npm lock file found: ${error.message}`);
      return null;
    }
  }

  async analyzeYarnLock(projectPath) {
    try {
      const lockPath = path.join(projectPath, this.lockFiles.yarn);
      const content = await fs.readFile(lockPath, 'utf8');
      
      // Parse yarn.lock format
      const dependencies = {};
      const lines = content.split('\n');
      let currentDep = null;

      for (const line of lines) {
        if (line.startsWith('"')) {
          currentDep = line.split('"')[1];
        } else if (line.includes('version') && currentDep) {
          const version = line.split('"')[1];
          dependencies[currentDep] = { version };
        }
      }

      return {
        dependencies,
        type: 'yarn'
      };
    } catch (error) {
      logger.debug(`No yarn lock file found: ${error.message}`);
      return null;
    }
  }

  async analyzePnpmLock(projectPath) {
    try {
      const lockPath = path.join(projectPath, this.lockFiles.pnpm);
      const content = await fs.readFile(lockPath, 'utf8');
      const lockfile = yaml.load(content);

      return {
        dependencies: this.flattenPnpmDependencies(lockfile.dependencies || {}),
        type: 'pnpm'
      };
    } catch (error) {
      logger.debug(`No pnpm lock file found: ${error.message}`);
      return null;
    }
  }

  flattenNpmDependencies(deps, result = {}, prefix = '') {
    for (const [name, info] of Object.entries(deps)) {
      const fullName = prefix ? `${prefix}/${name}` : name;
      result[fullName] = {
        version: info.version,
        resolved: info.resolved,
        integrity: info.integrity
      };

      if (info.dependencies) {
        this.flattenNpmDependencies(info.dependencies, result, fullName);
      }
    }
    return result;
  }

  flattenPnpmDependencies(deps) {
    const result = {};
    for (const [name, info] of Object.entries(deps)) {
      result[name] = {
        version: info.version,
        resolved: info.resolved
      };
    }
    return result;
  }

  analyzeMismatches(result) {
    const versions = new Map();
    const processed = new Set();

    // Helper to process dependencies
    const processDeps = (deps, type) => {
      if (!deps) return;

      Object.entries(deps).forEach(([name, info]) => {
        if (!versions.has(name)) {
          versions.set(name, new Map());
        }
        versions.get(name).set(type, info.version);
      });
    };

    // Process all lock files
    if (result.npm?.dependencies) {
      processDeps(result.npm.dependencies, 'npm');
    }
    if (result.yarn?.dependencies) {
      processDeps(result.yarn.dependencies, 'yarn');
    }
    if (result.pnpm?.dependencies) {
      processDeps(result.pnpm.dependencies, 'pnpm');
    }

    // Check for mismatches
    versions.forEach((typeVersions, name) => {
      const uniqueVersions = new Set(typeVersions.values());
      if (uniqueVersions.size > 1) {
        result.summary.versionMismatches.push(name);
      }
    });
  }
}

module.exports = new LockAnalyzer(); 