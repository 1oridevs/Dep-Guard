const { exec } = require('child_process');
const util = require('util');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

const execPromise = util.promisify(exec);

class SecurityChecker {
  constructor() {
    this.cache = cache;
  }

  async runSecurityAudit(packageName, version) {
    const cacheKey = `security:${packageName}@${version}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const { stdout } = await execPromise(`npm audit --json ${packageName}@${version}`);
      const results = JSON.parse(stdout);
      
      const vulnerabilities = this.processAuditResults(results);
      this.cache.set(cacheKey, vulnerabilities);
      
      return vulnerabilities;
    } catch (error) {
      logger.debug(`Security audit failed for ${packageName}:`, error);
      return [];
    }
  }

  processAuditResults(results) {
    const vulnerabilities = [];
    
    if (results.advisories) {
      Object.values(results.advisories).forEach(advisory => {
        vulnerabilities.push({
          id: advisory.id,
          title: advisory.title,
          severity: advisory.severity,
          vulnerable_versions: advisory.vulnerable_versions,
          recommendation: advisory.recommendation
        });
      });
    }

    return vulnerabilities;
  }

  async checkVulnerabilities(dependencies) {
    const results = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      const vulnerabilities = await this.runSecurityAudit(name, version);
      if (vulnerabilities.length > 0) {
        results.push({
          package: name,
          version: version,
          vulnerabilities
        });
      }
    }

    return results;
  }
}

module.exports = new SecurityChecker(); 