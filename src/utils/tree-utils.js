const madge = require('madge');
const path = require('path');
const logger = require('./logger');

class TreeUtils {
  async buildDependencyTree(projectPath) {
    try {
      const result = await madge(projectPath, {
        baseDir: projectPath,
        excludeRegExp: [/node_modules/],
        fileExtensions: ['js', 'jsx', 'ts', 'tsx']
      });

      return {
        tree: result.obj(),
        circular: result.circular(),
        orphans: result.orphans(),
        warnings: result.warnings()
      };
    } catch (error) {
      logger.error('Failed to build dependency tree:', error);
      throw error;
    }
  }

  async findCircularDependencies(projectPath) {
    const { circular } = await this.buildDependencyTree(projectPath);
    return circular.map(cycle => ({
      path: cycle,
      length: cycle.length,
      modules: cycle.map(file => path.basename(file))
    }));
  }

  async findOrphanedFiles(projectPath) {
    const { orphans } = await this.buildDependencyTree(projectPath);
    return orphans.map(file => ({
      path: file,
      name: path.basename(file)
    }));
  }

  formatTreeOutput(tree, options = {}) {
    const { maxDepth = Infinity } = options;
    const output = [];
    const visited = new Set();

    const formatNode = (node, depth = 0, prefix = '') => {
      if (depth > maxDepth || visited.has(node)) return;
      visited.add(node);

      output.push(prefix + node);

      const dependencies = tree[node] || [];
      dependencies.forEach((dep, i, arr) => {
        const isLast = i === arr.length - 1;
        const newPrefix = prefix + (isLast ? '└── ' : '├── ');
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        formatNode(dep, depth + 1, newPrefix);
      });
    };

    Object.keys(tree).forEach(root => {
      if (!visited.has(root)) {
        formatNode(root);
      }
    });

    return output.join('\n') + '\n';
  }
}

module.exports = new TreeUtils(); 