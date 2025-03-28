const semver = require('semver');
const logger = require('../../utils/logger');
const impactAnalyzer = require('../analyzers/impact-analyzer');

class UpdatePlanner {
  constructor() {
    this.impactAnalyzer = impactAnalyzer;
  }

  async planUpdates(dependencies) {
    const plans = [];
    const analyzed = await this.analyzeImpacts(dependencies);
    
    // Sort by impact score (lowest impact first)
    analyzed.sort((a, b) => a.impactScore - b.impactScore);

    // Group by update type
    const groups = {
      patch: analyzed.filter(d => d.updateType === 'patch'),
      minor: analyzed.filter(d => d.updateType === 'minor'),
      major: analyzed.filter(d => d.updateType === 'major')
    };

    // Plan updates in order: patch -> minor -> major
    plans.push(...this.planGroup(groups.patch, 'parallel'));
    plans.push(...this.planGroup(groups.minor, 'sequential'));
    plans.push(...this.planGroup(groups.major, 'manual'));

    return plans;
  }

  async analyzeImpacts(dependencies) {
    const analyzed = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      const impact = await this.impactAnalyzer.analyze(name);
      analyzed.push({
        name,
        version,
        updateType: this.getUpdateType(version, impact.latestVersion),
        impactScore: impact.score,
        breakingChanges: impact.breaking.length > 0,
        dependencies: impact.dependencies
      });
    }

    return analyzed;
  }

  planGroup(deps, strategy) {
    return deps.map(dep => ({
      package: dep.name,
      currentVersion: dep.version,
      targetVersion: dep.latestVersion,
      strategy,
      requiresManualReview: dep.breakingChanges,
      dependencies: dep.dependencies,
      rollbackPlan: this.createRollbackPlan(dep)
    }));
  }

  createRollbackPlan(dep) {
    return {
      package: dep.name,
      version: dep.version,
      steps: [
        `npm install ${dep.name}@${dep.version}`,
        `git checkout -- package.json package-lock.json`,
        'npm ci'
      ]
    };
  }

  getUpdateType(current, latest) {
    if (!semver.valid(current) || !semver.valid(latest)) return 'unknown';
    
    if (semver.major(latest) > semver.major(current)) return 'major';
    if (semver.minor(latest) > semver.minor(current)) return 'minor';
    if (semver.patch(latest) > semver.patch(current)) return 'patch';
    
    return 'none';
  }
}

module.exports = new UpdatePlanner(); 