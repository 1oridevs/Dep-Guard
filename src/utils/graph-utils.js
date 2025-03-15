const d3 = require('d3');
const { createSVGWindow } = require('svgdom');
const { JSDOM } = require('jsdom');

class GraphUtils {
  constructor() {
    this.window = createSVGWindow();
    this.document = this.window.document;
  }

  generateDependencyGraph(dependencies, options = {}) {
    const {
      width = 800,
      height = 600,
      nodeRadius = 5,
      fontSize = 12
    } = options;

    const svg = d3.select(this.document.documentElement)
      .attr('width', width)
      .attr('height', height);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id))
      .force('charge', d3.forceManyBody())
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Add links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6);

    // Add nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => this.getNodeColor(d));

    // Add labels
    const label = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.id)
      .attr('font-size', fontSize);

    return svg.node().outerHTML;
  }

  getNodeColor(node) {
    if (node.hasVulnerabilities) return '#ff0000';
    if (node.isOutdated) return '#ffa500';
    return '#66cc00';
  }
}

module.exports = new GraphUtils(); 