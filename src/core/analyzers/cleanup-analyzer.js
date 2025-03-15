const fs = require('fs').promises;
const path = require('path');
const madge = require('madge');
const logger = require('../../utils/logger');

class CleanupAnalyzer {
  constructor() {
    this.rules = [
      this.findUnusedDependencies,
      this.findDuplicateDependencies,
      this.findOverlappingDependencies,
      this.findDevDepsInProduction
    ];
  }

  async analyze(projectPath = process.cwd()) {
    try {
      const suggestions = [];
      const packageJson = await this.readPackageJson(projectPath);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Run all analysis rules
      for (const rule of this.rules) {
        const ruleSuggestions = await rule.call(this, projectPath, packageJson);
        suggestions.push(...ruleSuggestions);
      }

      return this.categorizeSuggestions(suggestions);
    } catch (error) {
      logger.error('Cleanup analysis failed:', error);
      throw error;
    }
  }

  async findUnusedDependencies(projectPath, packageJson) {
    const suggestions = [];
    
    try {
      // Use madge to analyze dependency usage
      const madgeResult = await madge(projectPath, {
        baseDir: projectPath,
        excludeRegExp: [/node_modules/, /\.(test|spec)\./]
      });

      const usedDeps = new Set(madgeResult.obj());
      const declaredDeps = new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {})
      ]);

      // Find unused dependencies
      for (const dep of declaredDeps) {
        if (!usedDeps.has(dep)) {
          suggestions.push({
            type: 'unused',
            level: 'warning',
            dependency: dep,
            message: `${dep} appears to be unused in your project`,
            action: `Consider removing "${dep}" from your dependencies`
          });
        }
      }
    } catch (error) {
      logger.debug('Error in unused dependencies analysis:', error);
    }

    return suggestions;
  }

  async findDuplicateDependencies(projectPath) {
    const suggestions = [];
    
    try {
      const lockFile = await fs.readFile(path.join(projectPath, 'package-lock.json'), 'utf8');
      const lockData = JSON.parse(lockFile);
      const versions = new Map();

      // Analyze dependencies in lock file
      this.traverseLockfile(lockData, versions);

      // Find duplicates
      for (const [name, versionSet] of versions.entries()) {
        if (versionSet.size > 1) {
          suggestions.push({
            type: 'duplicate',
            level: 'warning',
            dependency: name,
            message: `${name} has multiple versions: ${Array.from(versionSet).join(', ')}`,
            action: 'Consider updating to use a single version'
          });
        }
      }
    } catch (error) {
      logger.debug('Error in duplicate dependencies analysis:', error);
    }

    return suggestions;
  }

  async findOverlappingDependencies(projectPath, packageJson) {
    const suggestions = [];
    const overlaps = new Map();

    // Known overlapping packages
    const knownOverlaps = {
      'lodash': ['lodash.get', 'lodash.set', 'lodash.merge'],
      'request': ['request-promise', 'request-promise-native'],
      'moment': ['moment-timezone'],
      // Add more known overlaps
    };

    for (const [main, overlapping] of Object.entries(knownOverlaps)) {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps[main]) {
        for (const overlap of overlapping) {
          if (deps[overlap]) {
            suggestions.push({
              type: 'overlap',
              level: 'info',
              dependency: overlap,
              message: `${overlap} functionality is included in ${main}`,
              action: `Consider removing ${overlap} if you're already using ${main}`
            });
          }
        }
      }
    }

    return suggestions;
  }

  async findDevDepsInProduction(projectPath, packageJson) {
    const suggestions = [];
    const devDeps = packageJson.devDependencies || {};
    const prodImports = new Set();

    try {
      // Analyze production code imports
      const srcFiles = await this.findSourceFiles(projectPath);
      for (const file of srcFiles) {
        const content = await fs.readFile(file, 'utf8');
        const imports = this.extractImports(content);
        imports.forEach(imp => prodImports.add(imp));
      }

      // Check for dev dependencies used in production
      for (const [dep] of Object.entries(devDeps)) {
        if (prodImports.has(dep)) {
          suggestions.push({
            type: 'devInProd',
            level: 'error',
            dependency: dep,
            message: `${dep} is a devDependency but is used in production code`,
            action: `Move ${dep} to regular dependencies`
          });
        }
      }
    } catch (error) {
      logger.debug('Error in dev dependencies analysis:', error);
    }

    return suggestions;
  }

  categorizeSuggestions(suggestions) {
    return {
      errors: suggestions.filter(s => s.level === 'error'),
      warnings: suggestions.filter(s => s.level === 'warning'),
      info: suggestions.filter(s => s.level === 'info'),
      summary: {
        total: suggestions.length,
        errors: suggestions.filter(s => s.level === 'error').length,
        warnings: suggestions.filter(s => s.level === 'warning').length,
        info: suggestions.filter(s => s.level === 'info').length
      }
    };
  }

  // Helper methods...
  async readPackageJson(projectPath) {
    const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
    return JSON.parse(content);
  }

  traverseLockfile(data, versions, prefix = '') {
    if (!data.dependencies) return;
    
    for (const [name, info] of Object.entries(data.dependencies)) {
      const fullName = prefix ? `${prefix}/${name}` : name;
      if (!versions.has(name)) versions.set(name, new Set());
      versions.get(name).add(info.version);
      
      if (info.dependencies) {
        this.traverseLockfile(info, versions, fullName);
      }
    }
  }

  async findSourceFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await this.findSourceFiles(fullPath));
      } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  extractImports(content) {
    const imports = new Set();
    const regex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const [, name] = match;
      if (!name.startsWith('.') && !name.startsWith('@')) {
        imports.add(name.split('/')[0]);
      }
    }

    return imports;
  }
}

module.exports = new CleanupAnalyzer(); 