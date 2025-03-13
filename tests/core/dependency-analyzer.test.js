const dependencyAnalyzer = require('../../src/core/dependency-analyzer');

describe('Dependency Analyzer', () => {
  describe('detectCircularDependencies', () => {
    it('should detect simple circular dependencies', () => {
      const tree = {
        'a': ['b'],
        'b': ['c'],
        'c': ['a']
      };

      const circular = dependencyAnalyzer.detectCircularDependencies(tree);
      expect(circular).toHaveLength(1);
      expect(circular[0]).toBe('a -> b -> c -> a');
    });

    it('should handle no circular dependencies', () => {
      const tree = {
        'a': ['b'],
        'b': ['c'],
        'c': []
      };

      const circular = dependencyAnalyzer.detectCircularDependencies(tree);
      expect(circular).toHaveLength(0);
    });
  });

  describe('detectDuplicateDependencies', () => {
    it('should detect duplicate versions', () => {
      const dependencies = {
        'pkg-a': '1.0.0',
        'pkg-a-dep': '1.0.0',
        'pkg-b': '2.0.0'
      };

      const duplicates = dependencyAnalyzer.detectDuplicateDependencies(dependencies);
      expect(duplicates).toHaveLength(0);
    });
  });
}); 