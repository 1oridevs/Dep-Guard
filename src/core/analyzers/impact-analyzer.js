const fs = require('fs').promises;
const path = require('path');
const madge = require('madge');
const bundleAnalyzer = require('./bundle-analyzer');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class ImpactAnalyzer {
  constructor() {
    this.cache = cache;
  }

  async analyze(packageName, options = {}) {
    const cacheKey = `impact:${packageName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !options.noCache) return cached;

    try {
      const bundleImpact = await bundleAnalyzer.analyze(packageName);
      const dependencyImpact = await this.analyzeDependencyImpact(packageName);
      const codebaseImpact = await this.analyzeCodebaseImpact(packageName);
      const performanceImpact = await this.analyzePerformanceImpact(packageName);

      const results = {
        name: packageName,
        timestamp: new Date().toISOString(),
        bundle: bundleImpact,
        dependencies: dependencyImpact,
        codebase: codebaseImpact,
        performance: performanceImpact,
        score: this.calculateImpactScore(bundleImpact, dependencyImpact, codebaseImpact, performanceImpact),
        suggestions: this.generateSuggestions(bundleImpact, dependencyImpact, codebaseImpact, performanceImpact)
      };

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error('Impact analysis failed:', error);
      throw error;
    }
  }

  async analyzeDependencyImpact(packageName) {
    try {
      const madgeResult = await madge(process.cwd(), {
        excludeRegExp: [/node_modules/],
        fileExtensions: ['js', 'jsx', 'ts', 'tsx']
      });

      const dependencyGraph = madgeResult.obj();
      const impactedFiles = this.findImpactedFiles(dependencyGraph, packageName);
      const transitiveCount = this.countTransitiveDependencies(packageName);

      return {
        directDependencies: Object.keys(dependencyGraph).length,
        impactedFiles: impactedFiles.length,
        transitiveCount,
        impactedPaths: impactedFiles,
        criticalPaths: this.findCriticalPaths(dependencyGraph, packageName)
      };
    } catch (error) {
      logger.debug('Dependency impact analysis failed:', error);
      return null;
    }
  }

  async analyzeCodebaseImpact(packageName) {
    try {
      const files = await this.findSourceFiles(process.cwd());
      const impacts = {
        imports: 0,
        usages: 0,
        patterns: new Set(),
        files: []
      };

      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const fileImpact = this.analyzeFileImpact(content, packageName);
        
        if (fileImpact.hasImpact) {
          impacts.imports += fileImpact.imports;
          impacts.usages += fileImpact.usages;
          fileImpact.patterns.forEach(p => impacts.patterns.add(p));
          impacts.files.push({
            path: path.relative(process.cwd(), file),
            ...fileImpact
          });
        }
      }

      return {
        totalFiles: files.length,
        impactedFiles: impacts.files.length,
        importCount: impacts.imports,
        usageCount: impacts.usages,
        patterns: Array.from(impacts.patterns),
        details: impacts.files
      };
    } catch (error) {
      logger.debug('Codebase impact analysis failed:', error);
      return null;
    }
  }

  async analyzePerformanceImpact(packageName) {
    // Analyze runtime performance impact
    const metrics = {
      loadTime: await this.measureLoadTime(packageName),
      memoryUsage: await this.measureMemoryUsage(packageName),
      startupImpact: await this.measureStartupImpact(packageName)
    };

    return {
      metrics,
      score: this.calculatePerformanceScore(metrics),
      bottlenecks: this.identifyBottlenecks(metrics)
    };
  }

  calculateImpactScore(bundle, dependencies, codebase, performance) {
    const weights = {
      bundle: 0.3,
      dependencies: 0.2,
      codebase: 0.3,
      performance: 0.2
    };

    const scores = {
      bundle: this.calculateBundleScore(bundle),
      dependencies: this.calculateDependencyScore(dependencies),
      codebase: this.calculateCodebaseScore(codebase),
      performance: this.calculatePerformanceScore(performance)
    };

    return Object.entries(weights).reduce((total, [key, weight]) => {
      return total + (scores[key] * weight);
    }, 0);
  }

  generateSuggestions(bundle, dependencies, codebase, performance) {
    const suggestions = [];

    // Bundle-related suggestions
    if (bundle.impact.relative > 10) {
      suggestions.push({
        type: 'bundle',
        level: 'warning',
        message: `High bundle size impact (+${bundle.impact.relative.toFixed(1)}%)`,
        recommendation: 'Consider code splitting or using a lighter alternative'
      });
    }

    // Dependency-related suggestions
    if (dependencies.transitiveCount > 20) {
      suggestions.push({
        type: 'dependencies',
        level: 'warning',
        message: `High number of transitive dependencies (${dependencies.transitiveCount})`,
        recommendation: 'Look for alternatives with fewer dependencies'
      });
    }

    // Codebase-related suggestions
    if (codebase.impactedFiles > codebase.totalFiles * 0.3) {
      suggestions.push({
        type: 'codebase',
        level: 'warning',
        message: `Wide codebase impact (${((codebase.impactedFiles / codebase.totalFiles) * 100).toFixed(1)}% of files)`,
        recommendation: 'Consider modularizing the usage or finding a more focused alternative'
      });
    }

    // Performance-related suggestions
    if (performance.score < 0.7) {
      suggestions.push({
        type: 'performance',
        level: 'warning',
        message: 'Significant performance impact detected',
        recommendation: 'Profile the usage and optimize critical paths'
      });
    }

    return suggestions;
  }

  // Helper methods...
  async findSourceFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await this.findSourceFiles(fullPath));
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  analyzeFileImpact(content, packageName) {
    const impact = {
      hasImpact: false,
      imports: 0,
      usages: 0,
      patterns: new Set()
    };

    // Analyze imports
    const importRegex = new RegExp(`(?:import|require).*?['"]${packageName}.*?['"]`, 'g');
    const imports = content.match(importRegex) || [];
    impact.imports = imports.length;

    // Analyze usage patterns
    const usageRegex = new RegExp(`\\b${packageName}\\b`, 'g');
    const usages = content.match(usageRegex) || [];
    impact.usages = usages.length;

    if (impact.imports > 0 || impact.usages > 0) {
      impact.hasImpact = true;
      this.detectPatterns(content, packageName).forEach(p => impact.patterns.add(p));
    }

    return impact;
  }

  detectPatterns(content, packageName) {
    const patterns = new Set();
    
    // Common usage patterns
    const patternTests = {
      'direct-import': new RegExp(`import.*?${packageName}['"]`),
      'namespace-import': new RegExp(`import\\s+\\*\\s+as.*?${packageName}`),
      'dynamic-import': new RegExp(`import\\(.*?${packageName}.*?\\)`),
      'require': new RegExp(`require\\(.*?${packageName}.*?\\)`),
      'destructuring': new RegExp(`const\\s*?{.*?}\\s*?=\\s*?require\\(.*?${packageName}.*?\\)`)
    };

    for (const [pattern, regex] of Object.entries(patternTests)) {
      if (regex.test(content)) {
        patterns.add(pattern);
      }
    }

    return patterns;
  }
}

module.exports = new ImpactAnalyzer(); 