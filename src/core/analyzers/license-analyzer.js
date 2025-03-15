const fs = require('fs').promises;
const path = require('path');
const spdxLicenseList = require('spdx-license-list');
const logger = require('../../utils/logger');

class LicenseAnalyzer {
  constructor() {
    this.compatibilityMatrix = {
      'MIT': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'GPL-3.0'],
      'Apache-2.0': ['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
      'GPL-3.0': ['GPL-3.0'],
      'LGPL-3.0': ['LGPL-3.0', 'GPL-3.0'],
      'BSD-3-Clause': ['BSD-3-Clause', 'MIT', 'Apache-2.0', 'ISC'],
      'BSD-2-Clause': ['BSD-2-Clause', 'MIT', 'Apache-2.0', 'ISC'],
      'ISC': ['ISC', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause']
    };

    this.licenseCategories = {
      permissive: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
      copyleft: ['GPL-3.0', 'LGPL-3.0'],
      proprietary: ['UNLICENSED', 'SEE LICENSE IN LICENSE'],
      unknown: []
    };
  }

  async analyze(projectPath = process.cwd()) {
    try {
      const packageJson = await this.readPackageJson(projectPath);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      const projectLicense = packageJson.license || 'UNLICENSED';
      const results = await this.analyzeDependencies(dependencies, projectLicense);

      return {
        projectLicense,
        dependencies: results.dependencies,
        issues: results.issues,
        summary: this.generateSummary(results)
      };
    } catch (error) {
      logger.error('License analysis failed:', error);
      throw error;
    }
  }

  async analyzeDependencies(dependencies, projectLicense) {
    const results = {
      dependencies: {},
      issues: []
    };

    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const depPath = path.join(process.cwd(), 'node_modules', name, 'package.json');
        const depPackage = JSON.parse(await fs.readFile(depPath, 'utf8'));
        const license = this.normalizeLicense(depPackage.license);

        results.dependencies[name] = {
          name,
          version,
          license,
          category: this.getLicenseCategory(license),
          compatible: this.isCompatible(projectLicense, license)
        };

        if (!results.dependencies[name].compatible) {
          results.issues.push({
            type: 'incompatible',
            level: 'error',
            dependency: name,
            message: `License ${license} is incompatible with project license ${projectLicense}`
          });
        }

        if (license === 'UNKNOWN') {
          results.issues.push({
            type: 'unknown',
            level: 'warning',
            dependency: name,
            message: `Unknown license for ${name}`
          });
        }
      } catch (error) {
        logger.debug(`Failed to analyze license for ${name}:`, error);
        results.dependencies[name] = {
          name,
          version,
          license: 'UNKNOWN',
          category: 'unknown',
          compatible: false
        };
      }
    }

    return results;
  }

  isCompatible(projectLicense, dependencyLicense) {
    if (!this.compatibilityMatrix[projectLicense]) return false;
    return this.compatibilityMatrix[projectLicense].includes(dependencyLicense);
  }

  getLicenseCategory(license) {
    for (const [category, licenses] of Object.entries(this.licenseCategories)) {
      if (licenses.includes(license)) return category;
    }
    return 'unknown';
  }

  normalizeLicense(license) {
    if (!license) return 'UNKNOWN';
    if (typeof license === 'object' && license.type) {
      license = license.type;
    }
    
    // Handle SPDX expressions
    if (license.includes('OR') || license.includes('AND')) {
      return license.split(/\s+(?:OR|AND)\s+/)[0].trim();
    }

    // Normalize common variations
    const normalizations = {
      'MIT*': 'MIT',
      'BSD': 'BSD-3-Clause',
      'Apache': 'Apache-2.0',
      'GPL': 'GPL-3.0',
      'LGPL': 'LGPL-3.0'
    };

    return normalizations[license] || license;
  }

  generateSummary(results) {
    const summary = {
      total: Object.keys(results.dependencies).length,
      compatible: 0,
      incompatible: 0,
      unknown: 0,
      byCategory: {
        permissive: 0,
        copyleft: 0,
        proprietary: 0,
        unknown: 0
      }
    };

    for (const dep of Object.values(results.dependencies)) {
      if (dep.compatible) summary.compatible++;
      else if (dep.license === 'UNKNOWN') summary.unknown++;
      else summary.incompatible++;

      summary.byCategory[dep.category]++;
    }

    return summary;
  }

  async readPackageJson(projectPath) {
    const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
    return JSON.parse(content);
  }
}

module.exports = new LicenseAnalyzer(); 