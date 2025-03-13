const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class PolicyChecker {
  constructor() {
    this.cache = cache;
    this.defaultPolicyPath = path.join(process.cwd(), 'policies', 'default.policy.json');
  }

  async loadPolicy(policyPath = this.defaultPolicyPath) {
    const cacheKey = `policy-${policyPath}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const content = await fs.readFile(policyPath, 'utf8');
      const policy = JSON.parse(content);
      this.cache.set(cacheKey, policy);
      return policy;
    } catch (error) {
      logger.debug(`Failed to load policy from ${policyPath}:`, error);
      return this.getDefaultPolicy();
    }
  }

  getDefaultPolicy() {
    return {
      dependencies: {
        maxAge: 365, // days
        allowedUpdateTypes: ['patch', 'minor'],
        blockedPackages: [],
        allowedPackages: []
      },
      security: {
        maxVulnerabilityLevel: 'moderate',
        requireAudit: true,
        ignoreVulnerabilities: []
      },
      licenses: {
        allowed: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
        blocked: ['GPL', 'AGPL'],
        unknown: 'warn'
      }
    };
  }

  async checkDependency(dependency, policy = null) {
    if (!policy) {
      policy = await this.loadPolicy();
    }

    const issues = [];

    // Check if package is blocked
    if (policy.dependencies.blockedPackages.includes(dependency.name)) {
      issues.push({
        type: 'policy',
        level: 'high',
        message: `Package ${dependency.name} is blocked by policy`
      });
    }

    // Check update type against policy
    if (dependency.updateType && !policy.dependencies.allowedUpdateTypes.includes(dependency.updateType)) {
      issues.push({
        type: 'updates',
        level: 'warning',
        message: `Update type ${dependency.updateType} is not allowed for ${dependency.name}`
      });
    }

    // Check license against policy
    if (dependency.license) {
      if (policy.licenses.blocked.includes(dependency.license)) {
        issues.push({
          type: 'license',
          level: 'high',
          message: `License ${dependency.license} is blocked for ${dependency.name}`
        });
      } else if (!policy.licenses.allowed.includes(dependency.license)) {
        issues.push({
          type: 'license',
          level: policy.licenses.unknown === 'warn' ? 'warning' : 'high',
          message: `License ${dependency.license} is not allowed for ${dependency.name}`
        });
      }
    }

    // Check vulnerability level against policy
    if (dependency.vulnLevel && 
        this.getVulnerabilityScore(dependency.vulnLevel) > 
        this.getVulnerabilityScore(policy.security.maxVulnerabilityLevel)) {
      issues.push({
        type: 'security',
        level: 'high',
        message: `Vulnerability level ${dependency.vulnLevel} exceeds maximum allowed level for ${dependency.name}`
      });
    }

    return issues;
  }

  getVulnerabilityScore(level) {
    const scores = {
      'none': 0,
      'low': 1,
      'moderate': 2,
      'high': 3,
      'critical': 4
    };
    return scores[level.toLowerCase()] || 0;
  }

  async validatePolicy(policy) {
    const errors = [];
    const warnings = [];

    // Validate dependencies section
    if (!policy.dependencies) {
      errors.push('Missing dependencies section in policy');
    } else {
      if (!Array.isArray(policy.dependencies.allowedUpdateTypes)) {
        errors.push('allowedUpdateTypes must be an array');
      }
      if (!Array.isArray(policy.dependencies.blockedPackages)) {
        errors.push('blockedPackages must be an array');
      }
    }

    // Validate security section
    if (!policy.security) {
      errors.push('Missing security section in policy');
    } else {
      if (!['none', 'low', 'moderate', 'high', 'critical'].includes(policy.security.maxVulnerabilityLevel)) {
        errors.push('Invalid maxVulnerabilityLevel value');
      }
    }

    // Validate licenses section
    if (!policy.licenses) {
      errors.push('Missing licenses section in policy');
    } else {
      if (!Array.isArray(policy.licenses.allowed)) {
        errors.push('allowed licenses must be an array');
      }
      if (!Array.isArray(policy.licenses.blocked)) {
        errors.push('blocked licenses must be an array');
      }
      if (!['warn', 'block'].includes(policy.licenses.unknown)) {
        warnings.push('unknown license handling should be either "warn" or "block"');
      }
    }

    return { errors, warnings };
  }
}

module.exports = new PolicyChecker(); 