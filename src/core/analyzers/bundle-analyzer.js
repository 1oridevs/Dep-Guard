const webpack = require('webpack');
const path = require('path');
const logger = require('../../utils/logger');
const { promisify } = require('util');

class BundleAnalyzer {
  async analyzeBundleSize() {
    try {
      const stats = await this.getWebpackStats();
      return this.processStats(stats);
    } catch (error) {
      logger.error('Bundle analysis failed:', error);
      return {
        totalSize: 0,
        gzipSize: 0,
        largest: []
      };
    }
  }

  async getWebpackStats() {
    const config = {
      entry: path.join(process.cwd(), 'src/index.js'),
      mode: 'production',
      output: {
        path: path.join(process.cwd(), 'dist'),
        filename: 'bundle.js'
      }
    };

    const compiler = webpack(config);
    const run = promisify(compiler.run).bind(compiler);
    return run();
  }

  processStats(stats) {
    const { assets } = stats.toJson();
    const mainBundle = assets.find(a => a.name === 'bundle.js');

    return {
      totalSize: mainBundle ? mainBundle.size : 0,
      gzipSize: Math.round(mainBundle ? mainBundle.size * 0.3 : 0), // Estimate
      largest: this.getLargestDependencies(stats)
    };
  }

  getLargestDependencies(stats) {
    const { modules } = stats.toJson();
    return modules
      .filter(m => m.size > 1000) // Only modules > 1KB
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(m => ({
        name: this.getModuleName(m.name),
        size: m.size
      }));
  }

  getModuleName(path) {
    const match = path.match(/node_modules[/\\]([@\w-]+(?:[/\\][@\w-]+)?)/);
    return match ? match[1] : path;
  }
}

module.exports = new BundleAnalyzer(); 