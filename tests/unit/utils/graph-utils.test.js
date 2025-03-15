const graphUtils = require('../../../src/utils/graph-utils');

describe('GraphUtils', () => {
  it('should generate SVG graph', () => {
    const dependencies = {
      'test-pkg': {
        version: '1.0.0',
        dependencies: {
          'sub-pkg': '2.0.0'
        }
      }
    };

    const svg = graphUtils.generateDependencyGraph(dependencies);
    expect(svg).toContain('<svg');
    expect(svg).toContain('test-pkg');
    expect(svg).toContain('sub-pkg');
  });

  it('should handle circular dependencies', () => {
    const dependencies = {
      'pkg-a': {
        dependencies: { 'pkg-b': '1.0.0' }
      },
      'pkg-b': {
        dependencies: { 'pkg-a': '1.0.0' }
      }
    };

    const svg = graphUtils.generateDependencyGraph(dependencies);
    expect(svg).toContain('pkg-a');
    expect(svg).toContain('pkg-b');
  });

  it('should color nodes based on status', () => {
    const dependencies = {
      'vulnerable-pkg': {
        hasVulnerabilities: true
      },
      'outdated-pkg': {
        isOutdated: true
      },
      'healthy-pkg': {}
    };

    const svg = graphUtils.generateDependencyGraph(dependencies);
    expect(svg).toContain('#ff0000'); // Vulnerable
    expect(svg).toContain('#ffa500'); // Outdated
    expect(svg).toContain('#66cc00'); // Healthy
  });
}); 