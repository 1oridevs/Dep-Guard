const treeUtils = require('../../../src/utils/tree-utils');
const path = require('path');

describe('TreeUtils', () => {
  const testProjectPath = path.join(__dirname, 'test-project');

  describe('formatTreeOutput', () => {
    it('should format tree correctly', () => {
      const tree = {
        'index.js': ['a.js', 'b.js'],
        'a.js': ['c.js'],
        'b.js': ['c.js'],
        'c.js': []
      };

      const expected = 
        'index.js\n' +
        '├── a.js\n' +
        '│   └── c.js\n' +
        '└── b.js\n' +
        '    └── c.js\n';

      const result = treeUtils.formatTreeOutput(tree);
      expect(result).toBe(expected);
    });

    it('should respect maxDepth option', () => {
      const tree = {
        'index.js': ['a.js', 'b.js'],
        'a.js': ['c.js'],
        'b.js': ['c.js'],
        'c.js': []
      };

      const result = treeUtils.formatTreeOutput(tree, { maxDepth: 1 });
      const lines = result.trim().split('\n');
      expect(lines.length).toBe(3); // index.js + a.js + b.js
      expect(lines[0]).toBe('index.js');
      expect(lines[1]).toMatch(/a\.js$/);
      expect(lines[2]).toMatch(/b\.js$/);
    });
  });
}); 