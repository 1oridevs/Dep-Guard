class Dependency {
  constructor(name, version, type = 'dependencies') {
    this.name = name;
    this.currentVersion = version;
    this.type = type;
    this.latestVersion = null;
    this.suggestedUpdate = null;
    this.license = null;
    this.versionStatus = null;
    this.licenseStatus = null;
    this.vulnLevel = 'NONE';
    this.vulnCount = 0;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      suggestedUpdate: this.suggestedUpdate,
      license: this.license,
      versionStatus: this.versionStatus,
      licenseStatus: this.licenseStatus,
      vulnLevel: this.vulnLevel,
      vulnCount: this.vulnCount
    };
  }
}

module.exports = Dependency; 