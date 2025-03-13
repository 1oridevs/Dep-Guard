const dependencyScanner = require('./analyzers/dependency-scanner');
const logger = require('../utils/logger');
const semver = require('semver');

class DependencyAnalyzer {
  constructor() {
    this.scanner = dependencyScanner;
  }

  async analyze(projectPath) {
    try {
      // Read package.json
      const packageJson = await this.scanner.readPackageJson(projectPath);
      
      // Scan dependencies
      const dependencies = {
        ...(packageJson.dependencies || {}),
        // Optionally include devDependencies if needed
        // ...(packageJson.devDependencies || {})
      };

      const results = await this.scanner.scanDependencies(dependencies);
      
      // Process and categorize results
      const analysis = {
        summary: {
          total: results.length,
          issues: 0,
          critical: 0,
          updates: {
            major: 0,
            minor: 0,
            patch: 0
          }
        },
        dependencies: results.map(dep => ({
          name: dep.name,
          version: dep.version,
          latestVersion: dep.latestVersion,
          updateType: dep.updateType,
          license: dep.license,
          issues: this.validateDependency(dep)
        }))
      };

      // Update summary counts
      analysis.dependencies.forEach(dep => {
        analysis.summary.issues += dep.issues.length;
        analysis.summary.critical += dep.issues.filter(i => i.level === 'high').length;
        if (dep.updateType && dep.updateType !== 'current') {
          analysis.summary.updates[dep.updateType]++;
        }
      });

      return analysis;
    } catch (error) {
      logger.error('Analysis failed:', error);
      throw error;
    }
  }

  validateDependency(dep) {
    const issues = [];

    // Check update type
    if (dep.updateType === 'unknown') {
      issues.push({
        type: 'updates',
        level: 'warning',
        message: `Unable to determine update status for ${dep.name}`
      });
    } else if (dep.updateType !== 'current') {
      const level = dep.updateType === 'major' ? 'high' : 'warning';
      issues.push({
        type: 'updates',
        level,
        message: `${dep.updateType} update available (${dep.version} → ${dep.latestVersion})`
      });
    }

    // Check license
    if (!dep.license || dep.license === 'UNKNOWN') {
      issues.push({
        type: 'license',
        level: 'warning',
        message: `No license information found for ${dep.name}`
      });
    }

    // Check if version is valid
    if (!semver.valid(semver.clean(dep.version))) {
      issues.push({
        type: 'version',
        level: 'warning',
        message: `Invalid version format: ${dep.version}`
      });
    }

    return issues;
  }
}

module.exports = new DependencyAnalyzer(); 