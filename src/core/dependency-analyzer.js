const madge = require('madge');
const path = require('path');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const axios = require('axios');

class DependencyAnalyzer {
  constructor() {
    this.cache = cache;
  }

  async analyzeDependencyTree(projectPath) {
    try {
      const result = await madge(projectPath, {
        baseDir: projectPath,
        excludeRegExp: [/node_modules/],
        fileExtensions: ['js', 'jsx', 'ts', 'tsx']
      });

      return result.obj();
    } catch (error) {
      logger.error('Failed to analyze dependency tree:', error);
      throw new Error(`Dependency tree analysis failed: ${error.message}`);
    }
  }

  detectCircularDependencies(tree) {
    try {
      const circular = [];
      const visited = new Set();
      const path = [];

      const dfs = (node) => {
        if (path.includes(node)) {
          const cycle = path.slice(path.indexOf(node));
          circular.push(cycle.join(' -> ') + ' -> ' + node);
          return;
        }

        if (visited.has(node)) return;
        visited.add(node);
        path.push(node);

        const dependencies = tree[node] || [];
        for (const dep of dependencies) {
          dfs(dep);
        }

        path.pop();
      };

      for (const node of Object.keys(tree)) {
        dfs(node);
      }

      return circular;
    } catch (error) {
      logger.error('Failed to detect circular dependencies:', error);
      throw new Error(`Circular dependency detection failed: ${error.message}`);
    }
  }

  async analyzeBundleSize(packageName, version) {
    const cacheKey = `bundle-size-${packageName}@${version}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://bundlephobia.com/api/size?package=${packageName}@${version}`);
      const data = {
        size: response.data.size,
        gzip: response.data.gzip,
        dependencyCount: response.data.dependencyCount
      };

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      logger.debug(`Bundle size analysis failed for ${packageName}:`, error);
      return null;
    }
  }

  detectDuplicateDependencies(dependencies) {
    const versions = {};
    const duplicates = [];

    for (const [name, version] of Object.entries(dependencies)) {
      if (!versions[name]) {
        versions[name] = [];
      }
      versions[name].push(version);
    }

    for (const [name, versionList] of Object.entries(versions)) {
      if (versionList.length > 1) {
        duplicates.push({
          name,
          versions: versionList
        });
      }
    }

    return duplicates;
  }

  async getPackageStats(packageName, version) {
    const cacheKey = `package-stats-${packageName}@${version}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
      const data = {
        downloads: response.data.downloads,
        version,
        name: packageName
      };

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      logger.debug(`Failed to get package stats for ${packageName}:`, error);
      return null;
    }
  }
}

module.exports = new DependencyAnalyzer(); 