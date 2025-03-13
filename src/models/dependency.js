class Dependency {
  constructor(name, version, type = 'dependencies') {
    this.name = name;
    this.version = version;
    this.type = type;
    this.latestVersion = null;
    this.updateType = null;
    this.license = null;
    this.vulnerabilities = [];
    this.issues = [];
  }

  addIssue(type, level, message) {
    this.issues.push({
      type,
      level,
      message,
      dependency: this.name
    });
  }

  hasIssues() {
    return this.issues.length > 0;
  }

  hasCriticalIssues() {
    return this.issues.some(issue => issue.level === 'high');
  }

  toJSON() {
    return {
      name: this.name,
      version: this.version,
      type: this.type,
      latestVersion: this.latestVersion,
      updateType: this.updateType,
      license: this.license,
      vulnerabilities: this.vulnerabilities,
      issues: this.issues
    };
  }
}

module.exports = Dependency; 