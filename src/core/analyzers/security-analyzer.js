const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class SecurityAnalyzer {
  constructor() {
    this.cache = cache;
    this.vulnerabilityDBs = [
      'https://registry.npmjs.org/-/npm/v1/security/advisories',
      'https://github.com/advisories',
      'https://snyk.io/api/v1/vulns/npm'
    ];
  }

  async analyzeDependency(name, version) {
    const cacheKey = `security:${name}@${version}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const results = {
      name,
      version,
      vulnerabilities: [],
      supplyChainRisks: [],
      malwareDetected: false,
      sourceVerified: false,
      integrityCheck: await this.checkIntegrity(name, version),
      score: 0
    };

    try {
      await Promise.all([
        this.checkVulnerabilities(results),
        this.analyzeSupplyChain(results),
        this.scanForMalware(results),
        this.verifySource(results)
      ]);

      results.score = this.calculateSecurityScore(results);
      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error(`Security analysis failed for ${name}@${version}:`, error);
      throw error;
    }
  }

  async checkVulnerabilities(results) {
    for (const dbUrl of this.vulnerabilityDBs) {
      try {
        const response = await axios.get(`${dbUrl}/${results.name}`);
        const vulns = response.data.filter(v => 
          v.vulnerable_versions.includes(results.version)
        );
        results.vulnerabilities.push(...vulns);
      } catch (error) {
        logger.debug(`Vulnerability check failed for ${dbUrl}:`, error);
      }
    }
  }

  async analyzeSupplyChain(results) {
    // Check package ownership changes
    const ownershipHistory = await this.getOwnershipHistory(results.name);
    if (this.hasRecentOwnershipChanges(ownershipHistory)) {
      results.supplyChainRisks.push({
        type: 'ownership_change',
        severity: 'high',
        details: 'Recent package ownership changes detected'
      });
    }

    // Check for suspicious maintainer activity
    const maintainerActivity = await this.getMaintainerActivity(results.name);
    if (this.isSuspiciousActivity(maintainerActivity)) {
      results.supplyChainRisks.push({
        type: 'suspicious_activity',
        severity: 'high',
        details: 'Suspicious maintainer activity detected'
      });
    }
  }

  async scanForMalware(results) {
    const packageFiles = await this.getPackageFiles(results.name, results.version);
    
    // Check for known malicious patterns
    const malwarePatterns = await this.loadMalwarePatterns();
    for (const file of packageFiles) {
      if (await this.containsMaliciousCode(file, malwarePatterns)) {
        results.malwareDetected = true;
        break;
      }
    }
  }

  async verifySource(results) {
    // Verify package integrity
    const integrity = await this.verifyPackageIntegrity(results.name, results.version);
    if (!integrity.valid) {
      results.supplyChainRisks.push({
        type: 'integrity_violation',
        severity: 'critical',
        details: integrity.reason
      });
      return;
    }

    // Verify source repository
    const sourceInfo = await this.verifySourceRepository(results.name);
    results.sourceVerified = sourceInfo.verified;
  }

  calculateSecurityScore(results) {
    let score = 100;

    // Deduct points for vulnerabilities
    score -= results.vulnerabilities.length * 10;

    // Deduct points for supply chain risks
    score -= results.supplyChainRisks.length * 15;

    // Major deduction for malware
    if (results.malwareDetected) {
      score -= 50;
    }

    // Deduct points for unverified source
    if (!results.sourceVerified) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new SecurityAnalyzer(); 