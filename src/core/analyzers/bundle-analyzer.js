const fs = require('fs').promises;
const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class BundleAnalyzer {
  constructor() {
    this.cache = cache;
  }

  async analyze(packageName, options = {}) {
    const cacheKey = `bundle:${packageName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !options.noCache) return cached;

    try {
      const stats = await this.getBundleStats(packageName);
      const impact = await this.analyzeImpact(packageName);
      const treeshaking = await this.analyzeTreeshaking(packageName);
      
      const results = {
        name: packageName,
        timestamp: new Date().toISOString(),
        stats,
        impact,
        treeshaking,
        suggestions: this.generateSuggestions(stats, impact, treeshaking)
      };

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error('Bundle analysis failed:', error);
      throw error;
    }
  }

  async getBundleStats(packageName) {
    const config = {
      entry: require.resolve(packageName),
      mode: 'production',
      output: {
        path: path.resolve(process.cwd(), '.depguard/bundles'),
        filename: `${packageName}.bundle.js`
      },
      optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()]
      }
    };

    const stats = await this.runWebpack(config);
    const bundlePath = path.join(config.output.path, config.output.filename);
    const gzipSize = await this.getGzipSize(bundlePath);

    return {
      raw: stats.assets[0].size,
      gzip: gzipSize,
      modules: stats.modules.map(m => ({
        name: m.name,
        size: m.size
      }))
    };
  }

  async analyzeImpact(packageName) {
    const mainBundle = await this.getBundleStats('.');
    const withDep = await this.getBundleStats(`./${packageName}`);

    return {
      absolute: withDep.raw - mainBundle.raw,
      relative: ((withDep.raw - mainBundle.raw) / mainBundle.raw) * 100,
      chunks: withDep.modules.filter(m => m.name.includes(packageName))
    };
  }

  async analyzeTreeshaking(packageName) {
    const configs = [
      { sideEffects: true, modules: true },
      { sideEffects: false, modules: true },
      { sideEffects: false, modules: false }
    ];

    const results = await Promise.all(
      configs.map(config => this.getBundleWithConfig(packageName, config))
    );

    return {
      potential: Math.min(...results.map(r => r.size)),
      current: results[0].size,
      savings: results[0].size - Math.min(...results.map(r => r.size))
    };
  }

  generateSuggestions(stats, impact, treeshaking) {
    const suggestions = [];

    if (stats.raw > 100 * 1024) { // 100KB
      suggestions.push({
        type: 'size',
        level: 'warning',
        message: `Bundle size is large (${this.formatBytes(stats.raw)})`,
        recommendation: 'Consider code splitting or lazy loading'
      });
    }

    if (impact.relative > 10) { // 10%
      suggestions.push({
        type: 'impact',
        level: 'warning',
        message: `High bundle size impact (+${impact.relative.toFixed(1)}%)`,
        recommendation: 'Look for smaller alternatives or implement partial imports'
      });
    }

    if (treeshaking.savings > 10 * 1024) { // 10KB
      suggestions.push({
        type: 'treeshaking',
        level: 'info',
        message: `Potential tree-shaking optimization (${this.formatBytes(treeshaking.savings)})`,
        recommendation: 'Enable tree-shaking and check module side effects'
      });
    }

    return suggestions;
  }

  async runWebpack(config) {
    return new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err) reject(err);
        else resolve(stats.toJson());
      });
    });
  }

  async getBundleWithConfig(packageName, config) {
    const webpackConfig = {
      entry: require.resolve(packageName),
      mode: 'production',
      output: {
        path: path.resolve(process.cwd(), '.depguard/bundles'),
        filename: `${packageName}.${config.sideEffects}.bundle.js`
      },
      optimization: {
        sideEffects: config.sideEffects,
        usedExports: config.modules,
        minimize: true,
        minimizer: [new TerserPlugin()]
      }
    };

    const stats = await this.runWebpack(webpackConfig);
    return {
      size: stats.assets[0].size,
      config
    };
  }

  async getGzipSize(filePath) {
    const content = await fs.readFile(filePath);
    const gzip = require('zlib').gzipSync(content);
    return gzip.length;
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

module.exports = new BundleAnalyzer(); 