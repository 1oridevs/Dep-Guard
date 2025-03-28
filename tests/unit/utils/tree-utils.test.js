const treeUtils = require('../../../src/utils/tree-utils');
const path = require('path');

describe('TreeUtils', () => {
  const testProjectPath = path.join(__dirname, 'test-project');

  describe('formatTreeOutput', () => {
    test('should format simple tree correctly', () => {
      const tree = {
        name: 'index.js',
        children: [
          {
            name: 'a.js',
            children: [{ name: 'c.js' }]
          },
          { name: 'b.js' }
        ]
      };

      const expected = 
        'index.js\n' +
        '├── a.js\n' +
        '│   └── c.js\n' +
        '└── b.js\n';

      const result = treeUtils.formatTreeOutput(tree);
      expect(result).toBe(expected);
    });

    test('should include versions when available', () => {
      const tree = {
        name: 'root',
        version: '1.0.0',
        children: [
          {
            name: 'child',
            version: '2.0.0'
          }
        ]
      };

      const result = treeUtils.formatTreeOutput(tree);
      expect(result).toContain('root v1.0.0');
      expect(result).toContain('└── child v2.0.0');
    });

    test('should handle empty tree', () => {
      const tree = { name: 'empty' };
      const result = treeUtils.formatTreeOutput(tree);
      expect(result).toBe('empty\n');
    });

    test('should respect maxDepth option', () => {
      const tree = {
        name: 'index.js',
        children: [
          { name: 'a.js' },
          { name: 'b.js' }
        ]
      };

      const result = treeUtils.formatTreeOutput(tree, { maxDepth: 1 });
      const lines = result.trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('index.js');
      expect(lines[1]).toBe('├── a.js');
      expect(lines[2]).toBe('└── b.js');
    });
  });

  describe('buildDependencyTree', () => {
    test('should build tree from flat dependencies', () => {
      const deps = {
        'pkg-a': '1.0.0',
        'pkg-b/sub-b': '2.0.0',
        'pkg-c': '3.0.0'
      };

      const tree = treeUtils.buildDependencyTree(deps);
      expect(tree.name).toBe('dependencies');
      expect(tree.children).toHaveLength(3);
      expect(tree.children[0].name).toBe('pkg-a');
      expect(tree.children[0].version).toBe('1.0.0');
    });

    test('should handle nested dependencies', () => {
      const deps = {
        '@scope/pkg-a/lib': '1.0.0',
        '@scope/pkg-b': '2.0.0'
      };

      const tree = treeUtils.buildDependencyTree(deps);
      const flattened = treeUtils.flattenTree(tree);
      expect(flattened['@scope/pkg-a/lib']).toBe('1.0.0');
      expect(flattened['@scope/pkg-b']).toBe('2.0.0');
    });
  });

  describe('flattenTree', () => {
    test('should flatten nested tree structure', () => {
      const tree = {
        name: 'root',
        children: [
          {
            name: 'pkg-a',
            version: '1.0.0'
          },
          {
            name: 'pkg-b',
            children: [
              {
                name: 'sub-b',
                version: '2.0.0'
              }
            ]
          }
        ]
      };

      const flattened = treeUtils.flattenTree(tree);
      expect(flattened['pkg-a']).toBe('1.0.0');
      expect(flattened['pkg-b/sub-b']).toBe('2.0.0');
    });
  });
}); 