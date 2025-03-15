const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

class PerformanceAnalyzer {
  constructor() {
    this.cache = cache;
    this.metrics = {
      loadTime: this.measureLoadTime,
      memoryUsage: this.measureMemoryUsage,
      bundleSize: this.analyzeBundleSize,
      importCost: this.analyzeImportCost,
      runtimeMetrics: this.collectRuntimeMetrics
    };
  }

  async analyze(packageName, options = {}) {
    const cacheKey = `perf:${packageName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !options.noCache) return cached;

    try {
      const results = {
        name: packageName,
        timestamp: new Date().toISOString(),
        metrics: {}
      };

      // Run all metrics collection
      for (const [name, collector] of Object.entries(this.metrics)) {
        try {
          results.metrics[name] = await collector.call(this, packageName);
        } catch (error) {
          logger.debug(`Failed to collect ${name} metrics:`, error);
          results.metrics[name] = { error: error.message };
        }
      }

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error('Performance analysis failed:', error);
      throw error;
    }
  }

  async measureLoadTime(packageName) {
    const code = `
      const start = process.hrtime.bigint();
      require('${packageName}');
      const end = process.hrtime.bigint();
      console.log(Number(end - start) / 1e6);
    `;

    try {
      const loadTime = execSync(`node -e "${code}"`, { encoding: 'utf8' });
      return {
        value: parseFloat(loadTime),
        unit: 'ms'
      };
    } catch (error) {
      throw new Error(`Failed to measure load time: ${error.message}`);
    }
  }

  async measureMemoryUsage(packageName) {
    const code = `
      const startMem = process.memoryUsage();
      require('${packageName}');
      const endMem = process.memoryUsage();
      console.log(JSON.stringify({
        heapUsed: endMem.heapUsed - startMem.heapUsed,
        heapTotal: endMem.heapTotal - startMem.heapTotal,
        external: endMem.external - startMem.external,
        rss: endMem.rss - startMem.rss
      }));
    `;

    try {
      const usage = JSON.parse(execSync(`node -e "${code}"`, { encoding: 'utf8' }));
      return {
        heapUsed: { value: usage.heapUsed, unit: 'bytes' },
        heapTotal: { value: usage.heapTotal, unit: 'bytes' },
        external: { value: usage.external, unit: 'bytes' },
        rss: { value: usage.rss, unit: 'bytes' }
      };
    } catch (error) {
      throw new Error(`Failed to measure memory usage: ${error.message}`);
    }
  }

  async analyzeBundleSize(packageName) {
    try {
      const modulePath = require.resolve(packageName);
      const stats = await fs.stat(modulePath);
      
      return {
        raw: { value: stats.size, unit: 'bytes' },
        gzip: { value: this.getGzipSize(modulePath), unit: 'bytes' }
      };
    } catch (error) {
      throw new Error(`Failed to analyze bundle size: ${error.message}`);
    }
  }

  async analyzeImportCost(packageName) {
    const code = `
      const start = process.hrtime.bigint();
      const mod = require('${packageName}');
      const end = process.hrtime.bigint();
      console.log(JSON.stringify({
        importTime: Number(end - start) / 1e6,
        size: Buffer.byteLength(JSON.stringify(mod))
      }));
    `;

    try {
      const result = JSON.parse(execSync(`node -e "${code}"`, { encoding: 'utf8' }));
      return {
        importTime: { value: result.importTime, unit: 'ms' },
        size: { value: result.size, unit: 'bytes' }
      };
    } catch (error) {
      throw new Error(`Failed to analyze import cost: ${error.message}`);
    }
  }

  async collectRuntimeMetrics(packageName) {
    // Basic runtime performance checks
    const code = `
      const mod = require('${packageName}');
      const metrics = {
        constructorTime: 0,
        methodCallTime: 0,
        memoryLeak: false
      };

      if (typeof mod === 'function') {
        const start = process.hrtime.bigint();
        new mod();
        const end = process.hrtime.bigint();
        metrics.constructorTime = Number(end - start) / 1e6;
      }

      console.log(JSON.stringify(metrics));
    `;

    try {
      const metrics = JSON.parse(execSync(`node -e "${code}"`, { encoding: 'utf8' }));
      return metrics;
    } catch (error) {
      throw new Error(`Failed to collect runtime metrics: ${error.message}`);
    }
  }

  getGzipSize(filePath) {
    try {
      const gzip = execSync(`gzip -c "${filePath}" | wc -c`, { encoding: 'utf8' });
      return parseInt(gzip.trim(), 10);
    } catch {
      return 0;
    }
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

module.exports = new PerformanceAnalyzer(); 