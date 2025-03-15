const treeUtils = require('../../../src/utils/tree-utils');
const path = require('path');

describe('TreeUtils', () => {
  const testProjectPath = path.join(__dirname, 'test-project');

  describe('formatTreeOutput', () => {
    it('should format tree correctly', () => {
      const tree = {
        'index.js': ['a.js', 'b.js'],
        'a.js': ['c.js'],
        'b.js': ['c.js']
      };

      const result = treeUtils.formatTreeOutput(tree);
      const lines = result.split('\n');

      expect(lines[0]).toBe('index.js');
      expect(lines[1]).toBe('├── a.js');
      expect(lines[2]).toBe('│   └── c.js');
      expect(lines[3]).toBe('└── b.js');
      expect(lines[4]).toBe('    └── c.js');
      expect(lines[5]).toBe('');
    });

    it('should respect maxDepth option', () => {
      const tree = {
        'index.js': ['a.js', 'b.js'],
        'a.js': ['c.js'],
        'b.js': ['c.js']
      };

      const result = treeUtils.formatTreeOutput(tree, { maxDepth: 1 });
      const lines = result.trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('index.js');
      expect(lines[1]).toBe('├── a.js');
      expect(lines[2]).toBe('└── b.js');
    });
  });
}); 