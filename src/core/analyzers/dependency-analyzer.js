const madge = require('madge');
const path = require('path');
const logger = require('../../utils/logger');
const cache = require('../managers/cache-manager');

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
    const visited = new Map();
    const circularDeps = new Set();
    const path = [];

    const dfs = (node) => {
      if (path.includes(node)) {
        const cycle = path.slice(path.indexOf(node));
        circularDeps.add(cycle.join(' -> ') + ' -> ' + node);
        return;
      }

      if (visited.has(node)) return;
      visited.set(node, true);
      path.push(node);

      const dependencies = tree[node] || [];
      for (const dep of dependencies) {
        dfs(dep);
      }

      path.pop();
      visited.delete(node);
    };

    for (const node of Object.keys(tree)) {
      dfs(node);
    }

    return Array.from(circularDeps);
  }

  detectDuplicateDependencies(dependencies) {
    const seen = {};
    const duplicates = [];

    for (const [name, version] of Object.entries(dependencies)) {
      if (!seen[name]) {
        seen[name] = [];
      }
      seen[name].push(version);
    }

    for (const [name, versionList] of Object.entries(seen)) {
      if (versionList.length > 1) {
        duplicates.push({
          name,
          versions: versionList
        });
      }
    }

    return duplicates;
  }
}

module.exports = new DependencyAnalyzer(); 