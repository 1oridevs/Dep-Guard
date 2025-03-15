const fs = require('fs').promises;
const path = require('path');
const webpack = require('webpack');
const bundleAnalyzer = require('./bundle-analyzer');
const impactAnalyzer = require('./impact-analyzer');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class SizeOptimizer {
  constructor() {
    this.cache = cache;
    this.optimizationRules = [
      this.checkCodeSplitting,
      this.checkTreeShaking,
      this.checkUnusedExports,
      this.checkDynamicImports,
      this.checkAlternatives,
      this.checkCompression,
      this.checkModuleConcatenation
    ];
  }

  async analyze(packageName, options = {}) {
    const cacheKey = `size-opt:${packageName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !options.noCache) return cached;

    try {
      const bundleStats = await bundleAnalyzer.analyze(packageName);
      const impactStats = await impactAnalyzer.analyze(packageName);
      
      const results = {
        name: packageName,
        timestamp: new Date().toISOString(),
        currentSize: bundleStats.stats.raw,
        gzipSize: bundleStats.stats.gzip,
        treeshakingPotential: bundleStats.treeshaking.savings,
        suggestions: [],
        potentialSavings: 0
      };

      // Run all optimization rules
      for (const rule of this.optimizationRules) {
        const suggestion = await rule.call(this, packageName, bundleStats, impactStats);
        if (suggestion) {
          results.suggestions.push(suggestion);
          results.potentialSavings += suggestion.potentialSavings || 0;
        }
      }

      // Sort suggestions by potential impact
      results.suggestions.sort((a, b) => (b.potentialSavings || 0) - (a.potentialSavings || 0));

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error('Size optimization analysis failed:', error);
      throw error;
    }
  }

  async checkCodeSplitting(packageName, bundleStats, impactStats) {
    if (bundleStats.stats.raw > 50 * 1024) { // 50KB
      const usage = impactStats.codebase.patterns;
      const hasMultipleEntries = usage.size > 1;

      if (hasMultipleEntries) {
        return {
          type: 'code-splitting',
          level: 'suggestion',
          title: 'Consider Code Splitting',
          message: `${packageName} is used in multiple contexts and could benefit from code splitting`,
          details: 'Breaking the package into smaller chunks could improve initial load time',
          implementation: `
// Instead of:
import { bigFeature } from '${packageName}';

// Consider:
const bigFeature = await import('${packageName}/bigFeature');
          `,
          potentialSavings: Math.floor(bundleStats.stats.raw * 0.4) // Estimate 40% savings
        };
      }
    }
    return null;
  }

  async checkTreeShaking(packageName, bundleStats) {
    if (bundleStats.treeshaking.savings > 5 * 1024) { // 5KB
      return {
        type: 'tree-shaking',
        level: 'warning',
        title: 'Enable Tree Shaking',
        message: `${packageName} has significant tree-shaking potential`,
        details: `Potential savings of ${this.formatBytes(bundleStats.treeshaking.savings)}`,
        implementation: `
// Update webpack config:
module.exports = {
  mode: 'production',
  optimization: {
    usedExports: true,
    sideEffects: true
  }
}
        `,
        potentialSavings: bundleStats.treeshaking.savings
      };
    }
    return null;
  }

  async checkUnusedExports(packageName, bundleStats, impactStats) {
    const imports = impactStats.codebase.patterns;
    if (imports.has('namespace-import')) {
      return {
        type: 'unused-exports',
        level: 'suggestion',
        title: 'Optimize Imports',
        message: `${packageName} is imported entirely but may not need all exports`,
        details: 'Using specific imports can reduce bundle size',
        implementation: `
// Instead of:
import * as everything from '${packageName}';

// Use specific imports:
import { exactly, what, youneed } from '${packageName}';
        `,
        potentialSavings: Math.floor(bundleStats.stats.raw * 0.2) // Estimate 20% savings
      };
    }
    return null;
  }

  async checkDynamicImports(packageName, bundleStats, impactStats) {
    if (bundleStats.stats.raw > 100 * 1024) { // 100KB
      return {
        type: 'dynamic-imports',
        level: 'suggestion',
        title: 'Use Dynamic Imports',
        message: `${packageName} is large and could be loaded dynamically`,
        details: 'Loading the package on demand could improve initial page load',
        implementation: `
// Instead of:
import heavyPackage from '${packageName}';

// Consider:
async function loadWhenNeeded() {
  const heavyPackage = await import('${packageName}');
  // Use heavyPackage
}
        `,
        potentialSavings: Math.floor(bundleStats.stats.raw * 0.6) // Estimate 60% initial savings
      };
    }
    return null;
  }

  async checkAlternatives(packageName, bundleStats) {
    // List of known smaller alternatives
    const alternatives = {
      'moment': { name: 'date-fns', savings: 0.7 },
      'lodash': { name: 'lodash-es', savings: 0.5 },
      'jquery': { name: 'cash-dom', savings: 0.9 }
      // Add more alternatives
    };

    if (alternatives[packageName]) {
      const alt = alternatives[packageName];
      return {
        type: 'alternative',
        level: 'suggestion',
        title: 'Consider Smaller Alternative',
        message: `Consider using ${alt.name} instead of ${packageName}`,
        details: `${alt.name} is a lighter alternative with similar functionality`,
        implementation: `
// Instead of:
import pkg from '${packageName}';

// Consider:
import pkg from '${alt.name}';
        `,
        potentialSavings: Math.floor(bundleStats.stats.raw * alt.savings)
      };
    }
    return null;
  }

  async checkCompression(packageName, bundleStats) {
    const compressionRatio = bundleStats.stats.gzip / bundleStats.stats.raw;
    if (compressionRatio > 0.7) { // Poor compression ratio
      return {
        type: 'compression',
        level: 'suggestion',
        title: 'Improve Compression',
        message: `${packageName} has suboptimal compression characteristics`,
        details: 'The package might contain already compressed assets or inefficient code patterns',
        implementation: `
// Update webpack config:
module.exports = {
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            passes: 2
          }
        }
      })
    ]
  }
}
        `,
        potentialSavings: Math.floor(bundleStats.stats.raw * 0.15) // Estimate 15% savings
      };
    }
    return null;
  }

  async checkModuleConcatenation(packageName, bundleStats) {
    // Check if module concatenation might help
    if (bundleStats.stats.modules && bundleStats.stats.modules.length > 3) {
      return {
        type: 'concatenation',
        level: 'suggestion',
        title: 'Enable Module Concatenation',
        message: `${packageName} could benefit from module concatenation`,
        details: 'Combining modules can reduce bundle size and improve runtime performance',
        implementation: `
// Update webpack config:
module.exports = {
  optimization: {
    concatenateModules: true
  }
}
        `,
        potentialSavings: Math.floor(bundleStats.stats.raw * 0.1) // Estimate 10% savings
      };
    }
    return null;
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

module.exports = new SizeOptimizer(); 