const semver = require('semver');
const logger = require('./logger');
const { ValidationError } = require('./errors');

class DependencyValidator {
  constructor() {
    this.rules = {
      maxDependencies: 150,
      maxDevDependencies: 50,
      allowedVersionPrefixes: ['^', '~', '>='],
      blockedPackages: [],
      requiredPeerDependencies: {}
    };
  }

  async validateDependencies(packageJson, options = {}) {
    const issues = [];
    const { dependencies = {}, devDependencies = {}, peerDependencies = {} } = packageJson;

    // Check dependency counts
    if (Object.keys(dependencies).length > this.rules.maxDependencies) {
      issues.push({
        type: 'limit',
        level: 'warning',
        message: `Too many dependencies (${Object.keys(dependencies).length} > ${this.rules.maxDependencies})`
      });
    }

    // Validate version formats
    for (const [name, version] of Object.entries(dependencies)) {
      const versionIssues = this.validateVersion(name, version);
      issues.push(...versionIssues);
    }

    // Check for blocked packages
    const allDeps = { ...dependencies, ...devDependencies };
    for (const blocked of this.rules.blockedPackages) {
      if (blocked in allDeps) {
        issues.push({
          type: 'security',
          level: 'high',
          message: `Package "${blocked}" is blocked by policy`
        });
      }
    }

    // Validate peer dependencies
    for (const [name, required] of Object.entries(this.rules.requiredPeerDependencies)) {
      if (dependencies[name] && !peerDependencies[required]) {
        issues.push({
          type: 'peer',
          level: 'warning',
          message: `Package "${name}" requires peer dependency "${required}"`
        });
      }
    }

    return issues;
  }

  validateVersion(name, version) {
    const issues = [];

    // Check version format
    if (!semver.validRange(version)) {
      issues.push({
        type: 'version',
        level: 'error',
        message: `Invalid version format for "${name}": ${version}`
      });
      return issues;
    }

    // Check version prefix
    const prefix = version.match(/^[\^~>=]+/)?.[0];
    if (prefix && !this.rules.allowedVersionPrefixes.includes(prefix)) {
      issues.push({
        type: 'version',
        level: 'warning',
        message: `Package "${name}" uses disallowed version prefix: ${prefix}`
      });
    }

    return issues;
  }

  setRules(newRules) {
    this.rules = { ...this.rules, ...newRules };
  }
}

module.exports = new DependencyValidator(); 