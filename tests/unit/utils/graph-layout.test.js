const graphLayout = require('../../../src/utils/graph-layout');
const logger = require('../../../src/utils/logger');

jest.mock('../../../src/utils/logger');

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateLayout', () => {
    it('should calculate force layout by default', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.nodes[0]).toHaveProperty('x');
      expect(result.nodes[0]).toHaveProperty('y');
    });

    it('should calculate radial layout', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges, {
        type: 'radial',
        width: 800,
        height: 600
      });

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.nodes[0]).toHaveProperty('x');
      expect(result.nodes[0]).toHaveProperty('y');
    });

    it('should calculate hierarchical layout', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges, {
        type: 'hierarchical',
        width: 800,
        height: 600
      });

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.nodes[0]).toHaveProperty('x');
      expect(result.nodes[0]).toHaveProperty('y');
    });

    it('should fallback to force layout on error', async () => {
      const result = await graphLayout.calculateLayout(testNodes, testEdges, {
        type: 'invalid',
        width: 800,
        height: 600
      });

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('createHierarchy', () => {
    it('should create valid hierarchy structure', () => {
      const hierarchy = graphLayout.createHierarchy(testNodes, testEdges);
      
      expect(hierarchy.data.id).toBe('root');
      expect(hierarchy.children).toHaveLength(2);
      expect(hierarchy.children[0].data.id).toBe('child1');
      expect(hierarchy.children[1].data.id).toBe('child2');
    });
  });
}); 