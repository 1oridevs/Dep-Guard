const { exec } = require('child_process');
const util = require('util');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

const execPromise = util.promisify(exec);

class SecurityChecker {
  constructor() {
    this.cache = cache;
  }

  async runSecurityAudit(projectPath) {
    try {
      const { stdout } = await execPromise('npm audit --json', {
        cwd: projectPath
      });

      const auditData = JSON.parse(stdout);
      return this.processAuditResults(auditData);
    } catch (error) {
      if (error.stdout) {
        // npm audit returns non-zero exit code when vulnerabilities are found
        const auditData = JSON.parse(error.stdout);
        return this.processAuditResults(auditData);
      }
      
      logger.error('Security audit failed:', error);
      throw new Error(`Security audit failed: ${error.message}`);
    }
  }

  processAuditResults(auditData) {
    const results = {
      vulnerabilities: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      }
    };

    for (const [id, advisory] of Object.entries(auditData.advisories || {})) {
      results.vulnerabilities.push({
        id,
        title: advisory.title,
        package: advisory.module_name,
        version: advisory.findings[0]?.version,
        severity: advisory.severity,
        description: advisory.overview,
        recommendation: advisory.recommendation,
        url: advisory.url
      });

      results.summary.total++;
      results.summary[advisory.severity]++;
    }

    return results;
  }
}

module.exports = new SecurityChecker(); 