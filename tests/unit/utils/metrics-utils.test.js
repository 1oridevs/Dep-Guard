const metricsCollector = require('../../../src/utils/metrics-utils');

describe('MetricsCollector', () => {
  beforeEach(() => {
    metricsCollector.clear();
  });

  it('should record metrics', () => {
    metricsCollector.record('test', 100);
    metricsCollector.record('test', 200);

    const metrics = metricsCollector.getMetrics();
    expect(metrics.test).toEqual({
      count: 2,
      total: 300,
      min: 100,
      max: 200,
      average: 150
    });
  });

  it('should track timing', async () => {
    metricsCollector.startTimer('operation');
    await new Promise(resolve => setTimeout(resolve, 100));
    metricsCollector.endTimer('operation');

    const metrics = metricsCollector.getMetrics();
    expect(metrics.operation.count).toBe(1);
    expect(metrics.operation.total).toBeGreaterThanOrEqual(100);
  });
}); 