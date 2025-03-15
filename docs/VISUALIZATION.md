# Dependency Graph Visualization

Dependency Guardian provides powerful visualization tools to help you understand your dependency structure.

## Graph Generation

```javascript
const graphUtils = require('dependency-guardian/utils/graph-utils');

// Generate SVG graph
const svg = graphUtils.generateDependencyGraph(dependencies, {
  width: 1000,
  height: 800,
  nodeRadius: 6,
  fontSize: 14
});

// Save to file
fs.writeFileSync('dependency-graph.svg', svg);
```

## Node Colors

- 🔴 Red: Package has known vulnerabilities
- 🟠 Orange: Package is outdated
- 🟢 Green: Package is up-to-date and secure

## Interactive Mode

Run with the `--interactive` flag to open an interactive graph viewer:

```bash
dg analyze --interactive
```

## Configuration

```json
{
  "visualization": {
    "enabled": true,
    "format": "svg",
    "style": {
      "theme": "light",
      "colors": {
        "vulnerable": "#ff0000",
        "outdated": "#ffa500",
        "healthy": "#66cc00"
      }
    }
  }
}
``` 