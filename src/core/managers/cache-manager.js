const NodeCache = require('node-cache');

class CacheManager {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour default TTL
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false
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

  set(key, value, ttl = 3600) {
    return this.cache.set(key, value, ttl);
  }

  del(key) {
    return this.cache.del(key);
  }

  flush() {
    return this.cache.flushAll();
  }

  stats() {
    return this.cache.getStats();
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      keys: this.cache.keys().length,
      ...this.cache.getStats()
    };
  }
}

module.exports = new CacheManager(); 