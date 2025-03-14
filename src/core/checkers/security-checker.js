const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../../utils/logger');

class SecurityChecker {
  async check() {
    try {
      const npmAudit = await this.runNpmAudit();
      return this.processAuditResults(npmAudit);
    } catch (error) {
      logger.error('Security check failed:', error);
      return {
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, moderate: 0, low: 0 }
      };
    }
  }

  async runNpmAudit() {
    try {
      const { stdout } = await execPromise('npm audit --json');
      return JSON.parse(stdout);
    } catch (error) {
      if (error.stdout) {
        return JSON.parse(error.stdout);
      }
      throw error;
    }
  }

  processAuditResults(audit) {
    const result = {
      vulnerabilities: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      }
    };

    // Process vulnerabilities
    Object.entries(audit.vulnerabilities || {}).forEach(([name, vuln]) => {
      result.vulnerabilities.push({
        package: name,
        severity: vuln.severity,
        title: vuln.title,
        description: vuln.url,
        fixAvailable: vuln.fixAvailable,
        path: vuln.path
      });

      result.summary.total++;
      result.summary[vuln.severity]++;
    });

    return result;
  }
}

module.exports = new SecurityChecker(); 