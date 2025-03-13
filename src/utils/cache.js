const NodeCache = require('node-cache');

class Cache {
  constructor() {
    this.cache = new NodeCache({ 
      stdTTL: 3600,
      checkperiod: 120
    });
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.hits++;
    } else {
      this.misses++;
    }
    return value;
  }

  set(key, value) {
    return this.cache.set(key, value);
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      ratio: this.hits / (this.hits + this.misses || 1)
    };
  }
}

module.exports = new Cache(); 