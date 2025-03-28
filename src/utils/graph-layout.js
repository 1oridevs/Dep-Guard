const d3 = require('d3');
const logger = require('./logger');

class GraphLayoutManager {
  constructor() {
    this.layouts = {
      force: this.forceLayout.bind(this),
      radial: this.radialLayout.bind(this),
      hierarchical: this.hierarchicalLayout.bind(this)
    };
  }

  async calculateLayout(nodes, edges, options = {}) {
    const { type = 'force', width = 800, height = 600 } = options;

    try {
      const layout = this.layouts[type] || this.layouts.force;
      return await layout(nodes, edges, { width, height });
    } catch (error) {
      logger.error(`Failed to calculate ${type} layout:`, error);
      // Fallback to force layout
      return this.forceLayout(nodes, edges, { width, height });
    }
  }

  async forceLayout(nodes, edges, { width, height }) {
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Run simulation synchronously
    simulation.tick(300);
    simulation.stop();

    return {
      nodes: nodes.map(node => ({
        ...node,
        x: Math.max(0, Math.min(width, node.x)),
        y: Math.max(0, Math.min(height, node.y))
      })),
      edges
    };
  }

  async radialLayout(nodes, edges, { width, height }) {
    const radius = Math.min(width, height) / 2 - 50;
    const angleStep = (2 * Math.PI) / nodes.length;

    nodes.forEach((node, i) => {
      node.x = width/2 + radius * Math.cos(i * angleStep);
      node.y = height/2 + radius * Math.sin(i * angleStep);
    });

    return { nodes, edges };
  }

  async hierarchicalLayout(nodes, edges, { width, height }) {
    const hierarchy = this.createHierarchy(nodes, edges);
    const treeLayout = d3.tree().size([width, height]);
    const root = treeLayout(hierarchy);

    // Convert back to our format
    return {
      nodes: root.descendants().map(d => ({
        ...d.data,
        x: d.x,
        y: d.y
      })),
      edges: root.links().map(d => ({
        source: d.source.data.id,
        target: d.target.data.id
      }))
    };
  }

  createHierarchy(nodes, edges) {
    // Find root node (node with no incoming edges)
    const hasIncoming = new Set(edges.map(e => e.target));
    const rootId = nodes.find(n => !hasIncoming.has(n.id))?.id || nodes[0]?.id;

    // Create hierarchy data
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, children: [] }]));
    edges.forEach(edge => {
      const parent = nodeMap.get(edge.source);
      const child = nodeMap.get(edge.target);
      if (parent && child) {
        parent.children.push(child);
      }
    });

    return d3.hierarchy(nodeMap.get(rootId));
  }
}

module.exports = new GraphLayoutManager(); 