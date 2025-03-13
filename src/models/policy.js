class Policy {
  constructor(data = {}) {
    this.name = data.name || 'Default Policy';
    this.version = data.version || '1.0.0';
    this.description = data.description || 'Default dependency management policy';
    this.extends = data.extends || [];

    this.rules = {
      licenses: {
        allowed: data.rules?.licenses?.allowed || ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
        blocked: data.rules?.licenses?.blocked || ['GPL', 'AGPL'],
        unknown: data.rules?.licenses?.unknown || 'warn'
      },
      security: {
        maxSeverity: data.rules?.security?.maxSeverity || 'moderate',
        autofix: data.rules?.security?.autofix || false,
        exceptions: data.rules?.security?.exceptions || []
      },
      versioning: {
        maxAge: data.rules?.versioning?.maxAge || '6 months',
        allowMajorUpdates: data.rules?.versioning?.allowMajorUpdates || false,
        allowedUpdateTypes: data.rules?.versioning?.allowedUpdateTypes || ['patch', 'minor'],
        autoMerge: {
          patch: data.rules?.versioning?.autoMerge?.patch || true,
          minor: data.rules?.versioning?.autoMerge?.minor || false,
          major: data.rules?.versioning?.autoMerge?.major || false
        }
      },
      dependencies: {
        maxDirect: data.rules?.dependencies?.maxDirect || 150,
        maxDepth: data.rules?.dependencies?.maxDepth || 10,
        bannedPackages: data.rules?.dependencies?.bannedPackages || [],
        requiredPackages: data.rules?.dependencies?.requiredPackages || [],
        duplicatesAllowed: data.rules?.dependencies?.duplicatesAllowed || false
      }
    };

    this.notifications = {
      slack: data.notifications?.slack || false,
      email: data.notifications?.email || false,
      githubIssues: data.notifications?.githubIssues || true
    };
  }

  validate() {
    const errors = [];
    const warnings = [];

    // Validate license rules
    if (!Array.isArray(this.rules.licenses.allowed)) {
      errors.push('Allowed licenses must be an array');
    }
    if (!Array.isArray(this.rules.licenses.blocked)) {
      errors.push('Blocked licenses must be an array');
    }

    // Validate security rules
    const validSeverities = ['low', 'moderate', 'high', 'critical'];
    if (!validSeverities.includes(this.rules.security.maxSeverity)) {
      errors.push('Invalid security severity level');
    }

    // Validate versioning rules
    if (typeof this.rules.versioning.allowMajorUpdates !== 'boolean') {
      errors.push('allowMajorUpdates must be a boolean');
    }

    // Validate dependency rules
    if (typeof this.rules.dependencies.maxDirect !== 'number') {
      errors.push('maxDirect must be a number');
    }
    if (typeof this.rules.dependencies.maxDepth !== 'number') {
      errors.push('maxDepth must be a number');
    }

    return { errors, warnings };
  }

  toJSON() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      extends: this.extends,
      rules: this.rules,
      notifications: this.notifications
    };
  }
}

module.exports = Policy; 