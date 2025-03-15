const d3 = require('d3');
const logger = require('./logger');

class GraphLayoutManager {
  constructor() {
    this.layouts = {
      force: this.forceLayout,
      radial: this.radialLayout,
      hierarchical: this.hierarchicalLayout
    };
  }

  async calculateLayout(nodes, edges, options = {}) {
    const {
      type = 'force',
      width = 800,
      height = 600,
      padding = 40
    } = options;

    try {
      const layout = this.layouts[type] || this.layouts.force;
      return await layout.call(this, nodes, edges, { width, height, padding });
    } catch (error) {
      logger.error('Failed to calculate graph layout:', error);
      throw error;
    }
  }

  async forceLayout(nodes, edges, options) {
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(options.width / 2, options.height / 2))
      .stop();

    // Run simulation synchronously
    for (let i = 0; i < 300; ++i) simulation.tick();
    
    return { nodes, edges };
  }

  async radialLayout(nodes, edges, options) {
    const radius = Math.min(options.width, options.height) / 2 - options.padding;
    const angleStep = (2 * Math.PI) / nodes.length;

    nodes.forEach((node, i) => {
      node.x = options.width/2 + radius * Math.cos(i * angleStep);
      node.y = options.height/2 + radius * Math.sin(i * angleStep);
    });

    return { nodes, edges };
  }

  async hierarchicalLayout(nodes, edges, options) {
    const hierarchy = d3.stratify()
      .id(d => d.id)
      .parentId(d => this.findParent(d, edges))(nodes);

    const treeLayout = d3.tree()
      .size([options.width - options.padding * 2, options.height - options.padding * 2]);

    const tree = treeLayout(hierarchy);

    // Convert back to flat structure
    nodes.forEach(node => {
      const treeNode = tree.find(n => n.id === node.id);
      if (treeNode) {
        node.x = treeNode.x + options.padding;
        node.y = treeNode.y + options.padding;
      }
    });

    return { nodes, edges };
  }

  findParent(node, edges) {
    const edge = edges.find(e => e.target.id === node.id);
    return edge ? edge.source.id : null;
  }
}

module.exports = new GraphLayoutManager(); 