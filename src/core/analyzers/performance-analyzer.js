const webpack = require('webpack');
const { execSync } = require('child_process');
const logger = require('../../utils/logger');
const cache = require('../../utils/cache');
const bundleAnalyzer = require('./bundle-analyzer');

class PerformanceAnalyzer {
  constructor() {
    this.cache = cache;
    this.metrics = {
      bundleSize: 0,
      loadTime: 0,
      memoryUsage: 0,
      treeShaking: 0,
      runtimeScore: 0
    };
  }

  async analyzePackage(name, version) {
    const cacheKey = `perf:${name}@${version}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const results = {
        name,
        version,
        bundleMetrics: await this.analyzeBundleImpact(name, version),
        runtimeMetrics: await this.analyzeRuntime(name, version),
        memoryMetrics: await this.analyzeMemoryUsage(name, version),
        loadTimeMetrics: await this.analyzeLoadTime(name, version),
        treeShakingMetrics: await this.analyzeTreeShaking(name, version),
        score: 0
      };

      results.score = this.calculatePerformanceScore(results);
      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      logger.error(`Performance analysis failed for ${name}@${version}:`, error);
      throw error;
    }
  }

  async analyzeBundleImpact(name, version) {
    const bundleStats = await bundleAnalyzer.analyzeBundleSize(name, version);
    return {
      rawSize: bundleStats.size,
      gzipSize: bundleStats.gzip,
      sizeImpact: await this.calculateSizeImpact(bundleStats),
      unusedExports: await this.findUnusedExports(name, version),
      treeShakenSize: await this.calculateTreeShakenSize(bundleStats)
    };
  }

  async analyzeRuntime(name, version) {
    const benchmarks = await this.runBenchmarks(name, version);
    return {
      initTime: benchmarks.initialization,
      methodCallTime: benchmarks.methodCalls,
      gcPauses: benchmarks.gcMetrics,
      cpuUsage: benchmarks.cpuMetrics,
      asyncPerformance: benchmarks.asyncMetrics
    };
  }

  async analyzeMemoryUsage(name, version) {
    const memoryStats = await this.collectMemoryStats(name, version);
    return {
      heapUsage: memoryStats.heap,
      leakPotential: memoryStats.leaks,
      gcFrequency: memoryStats.gcFreq,
      retainedSize: memoryStats.retained,
      allocationRate: memoryStats.allocRate
    };
  }

  async analyzeLoadTime(name, version) {
    const loadStats = await this.measureLoadTime(name, version);
    return {
      importTime: loadStats.import,
      requireTime: loadStats.require,
      initializationTime: loadStats.init,
      firstCallTime: loadStats.firstCall
    };
  }

  async analyzeTreeShaking(name, version) {
    const treeShakingStats = await this.analyzeModuleUsage(name, version);
    return {
      deadCode: treeShakingStats.deadCode,
      unusedExports: treeShakingStats.unusedExports,
      sideEffects: treeShakingStats.sideEffects,
      optimizationLevel: treeShakingStats.optimization
    };
  }

  calculatePerformanceScore(results) {
    const weights = {
      bundle: 0.3,
      runtime: 0.25,
      memory: 0.2,
      loadTime: 0.15,
      treeShaking: 0.1
    };

    const scores = {
      bundle: this.scoreBundleMetrics(results.bundleMetrics),
      runtime: this.scoreRuntimeMetrics(results.runtimeMetrics),
      memory: this.scoreMemoryMetrics(results.memoryMetrics),
      loadTime: this.scoreLoadTimeMetrics(results.loadTimeMetrics),
      treeShaking: this.scoreTreeShaking(results.treeShakingMetrics)
    };

    return Object.entries(weights).reduce((total, [key, weight]) => {
      return total + (scores[key] * weight);
    }, 0);
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