class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
  }

  startTimer(name) {
    this.timers.set(name, process.hrtime());
  }

  endTimer(name) {
    const start = this.timers.get(name);
    if (!start) return;

    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds * 1000 + nanoseconds / 1e6;
    this.record(name, duration);
  }

  record(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity
      });
    }

    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
  }

  getMetrics() {
    const result = {};
    for (const [name, metric] of this.metrics) {
      result[name] = {
        ...metric,
        average: metric.total / metric.count
      };
    }
    return result;
  }

  clear() {
    this.metrics.clear();
    this.timers.clear();
  }
}

module.exports = new MetricsCollector(); 