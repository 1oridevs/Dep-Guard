const madge = require('madge');
const path = require('path');
const logger = require('./logger');
const chalk = require('chalk');

class TreeUtils {
  constructor() {
    this.symbols = {
      branch: '├── ',
      lastBranch: '└── ',
      vertical: '│   ',
      space: '    '
    };
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

  formatTreeOutput(tree, prefix = '', isLast = true) {
    let output = '';
    const indent = prefix ? (isLast ? this.symbols.space : this.symbols.vertical) : '';
    
    // Add current node
    if (tree.name) {
      const marker = prefix ? (isLast ? this.symbols.lastBranch : this.symbols.branch) : '';
      const version = tree.version ? chalk.gray(` v${tree.version}`) : '';
      output += `${prefix}${marker}${tree.name}${version}\n`;
    }

    // Process children
    if (tree.children && tree.children.length > 0) {
      tree.children.forEach((child, index) => {
        const isLastChild = index === tree.children.length - 1;
        output += this.formatTreeOutput(child, prefix + indent, isLastChild);
      });
    }

    return output;
  }

  colorize(tree, getColor = () => chalk.white) {
    const lines = this.formatTreeOutput(tree).split('\n');
    return lines.map(line => {
      const [prefix, name] = line.split(/(?<=^[│├└\s]+)/);
      return prefix + getColor(name)(name);
    }).join('\n');
  }

  buildDependencyTree(dependencies, options = {}) {
    const tree = {
      name: options.rootName || 'dependencies',
      children: []
    };

    try {
      Object.entries(dependencies).forEach(([name, version]) => {
        const parts = name.split('/');
        let current = tree;

        parts.forEach((part, index) => {
          const isLast = index === parts.length - 1;
          let child = current.children.find(c => c.name === part);

          if (!child) {
            child = {
              name: part,
              ...(isLast ? { version } : { children: [] })
            };
            current.children.push(child);
          }

          current = child;
        });
      });

      return tree;
    } catch (error) {
      logger.error('Failed to build dependency tree:', error);
      throw error;
    }
  }

  flattenTree(tree, parentPath = '') {
    const result = {};

    try {
      const traverse = (node, currentPath) => {
        if (node.version) {
          result[currentPath] = node.version;
        }

        if (node.children) {
          node.children.forEach(child => {
            const childPath = currentPath ? `${currentPath}/${child.name}` : child.name;
            traverse(child, childPath);
          });
        }
      };

      traverse(tree, parentPath);
      return result;
    } catch (error) {
      logger.error('Failed to flatten tree:', error);
      throw error;
    }
  }
}

module.exports = new TreeUtils(); 