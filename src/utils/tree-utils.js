const madge = require('madge');
const path = require('path');
const logger = require('./logger');
const chalk = require('chalk');

class TreeUtils {
  constructor() {
    this.indent = '  ';
  }

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
    const lines = [];
    const maxDepth = options.maxDepth || Infinity;

    function traverse(node, prefix = '', depth = 0) {
      if (depth > maxDepth) return;

      // Add root node
      if (depth === 0) {
        lines.push(node.name);
      }

      // Process children
      if (node.children && depth < maxDepth) {
        const children = node.children;
        children.forEach((child, index) => {
          const isLast = index === children.length - 1;
          const linePrefix = isLast ? '└── ' : '├── ';
          const childPrefix = isLast ? '    ' : '│   ';
          
          lines.push(prefix + linePrefix + child.name);
          
          if (child.children) {
            traverse(child, prefix + childPrefix, depth + 1);
          }
        });
      }
    }

    traverse(tree);
    return lines.join('\n');
  }

  colorize(tree, getColor = () => chalk.white) {
    const lines = this.formatTreeOutput(tree).split('\n');
    return lines.map(line => {
      const [prefix, name] = line.split(/(?<=^[│├└\s]+)/);
      return prefix + getColor(name)(name);
    }).join('\n');
  }
}

module.exports = new TreeUtils(); 