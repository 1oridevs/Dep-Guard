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

  it('should handle concurrent timers', async () => {
    metricsCollector.startTimer('op1');
    metricsCollector.startTimer('op2');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    metricsCollector.endTimer('op1');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    metricsCollector.endTimer('op2');
    
    const metrics = metricsCollector.getMetrics();
    expect(metrics.op1.total).toBeLessThan(metrics.op2.total);
  });

  it('should track memory usage', () => {
    metricsCollector.recordMemory('heap');
    const metrics = metricsCollector.getMetrics();
    expect(metrics.heap).toBeDefined();
    expect(metrics.heap.total).toBeGreaterThan(0);
  });

  it('should calculate percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      metricsCollector.record('test', i);
    }
    
    const stats = metricsCollector.getPercentiles('test', [50, 90, 95]);
    expect(stats.p50).toBe(50);
    expect(stats.p90).toBe(90);
    expect(stats.p95).toBe(95);
  });
}); 