const fs = require('fs').promises;
const path = require('path');
const semver = require('semver');
const logger = require('../../utils/logger');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class DependencyAnalyzer {
  async analyze() {
    try {
      // Read package.json
      const packageJson = await this.readPackageJson();
      
      // Get installed dependencies info
      const installedDeps = await this.getInstalledDependencies();
      
      // Get outdated dependencies
      const outdatedDeps = await this.getOutdatedDependencies();
      
      // Combine all information
      return this.buildDependencyList(packageJson, installedDeps, outdatedDeps);
    } catch (error) {
      logger.error('Dependency analysis failed:', error);
      return [];
    }
  }

  async readPackageJson() {
    const content = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    return JSON.parse(content);
  }

  async getInstalledDependencies() {
    try {
      const { stdout } = await execPromise('npm list --json');
      return JSON.parse(stdout);
    } catch (error) {
      // npm list can exit with error but still return valid JSON
      if (error.stdout) {
        return JSON.parse(error.stdout);
      }
      throw error;
    }
  }

  async getOutdatedDependencies() {
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

  buildDependencyList(packageJson, installed, outdated) {
    const dependencies = [];
    const { dependencies: deps, devDependencies: devDeps } = packageJson;

    // Process production dependencies
    Object.entries(deps || {}).forEach(([name, version]) => {
      dependencies.push(this.buildDependencyInfo(name, version, false, installed, outdated));
    });

    // Process dev dependencies
    Object.entries(devDeps || {}).forEach(([name, version]) => {
      dependencies.push(this.buildDependencyInfo(name, version, true, installed, outdated));
    });

    return dependencies;
  }

  buildDependencyInfo(name, version, isDev, installed, outdated) {
    const info = {
      name,
      required: version,
      isDev,
      installed: this.getInstalledVersion(name, installed),
      isOutdated: false,
      latest: null,
      updateType: null
    };

    // Check if outdated
    if (outdated[name]) {
      info.isOutdated = true;
      info.latest = outdated[name].latest;
      info.updateType = this.getUpdateType(info.installed, info.latest);
    }

    return info;
  }

  getInstalledVersion(name, installed) {
    try {
      return installed.dependencies[name].version;
    } catch (e) {
      return null;
    }
  }

  getUpdateType(current, latest) {
    if (!current || !latest) return null;
    
    const currentVersion = semver.clean(current);
    const latestVersion = semver.clean(latest);
    
    if (semver.major(latestVersion) > semver.major(currentVersion)) {
      return 'major';
    } else if (semver.minor(latestVersion) > semver.minor(currentVersion)) {
      return 'minor';
    }
    return 'patch';
  }
}

module.exports = new DependencyAnalyzer(); 