# Performance Metrics

Dependency Guardian collects various performance metrics to help you optimize your dependency management:

## Request Metrics
- Response times
- Success/failure rates
- Cache hit ratios
- Network bandwidth usage

## Analysis Metrics
- Scan duration
- Memory usage
- CPU utilization
- File I/O operations

## Custom Metrics
You can collect custom metrics using the metrics collector:

```javascript
const metrics = require('dependency-guardian/utils/metrics');

metrics.startTimer('custom-operation');
// ... your code ...
metrics.endTimer('custom-operation');

// Record custom values
metrics.record('downloads', packageStats.downloads);
```

## Configuration
```json
{
  "metrics": {
    "enabled": true,
    "collectMemory": true,
    "collectCpu": true,
    "reportInterval": 60000
  }
}
``` 