const graphLayout = require('../../../src/utils/graph-layout');

describe('GraphLayoutManager', () => {
  const testNodes = [
    { id: 'root' },
    { id: 'child1' },
    { id: 'child2' }
  ];

  const testEdges = [
    { source: 'root', target: 'child1' },
    { source: 'root', target: 'child2' }
  ];

  describe('calculateLayout', () => {
    it('should calculate force layout', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges, {
        type: 'force',
        width: 800,
        height: 600
      });

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      result.nodes.forEach(node => {
        expect(node.x).toBeDefined();
        expect(node.y).toBeDefined();
      });
    });

    it('should calculate radial layout', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges, {
        type: 'radial',
        width: 800,
        height: 600
      });

      expect(result.nodes).toHaveLength(3);
      result.nodes.forEach(node => {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(800);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(600);
      });
    });

    it('should handle invalid layout type', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges, {
        type: 'invalid',
        width: 800,
        height: 600
      });

      // Should fall back to force layout
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
    });
  });
}); 