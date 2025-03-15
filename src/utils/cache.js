const NodeCache = require('node-cache');

class Cache {
  constructor(options = {}) {
    this.cache = new NodeCache({
      stdTTL: options.ttl || 3600, // 1 hour default TTL
      checkperiod: options.checkperiod || 600, // Check for expired keys every 10 minutes
      useClones: false,
      maxKeys: options.maxKeys || -1 // Unlimited by default
    });
  }

  get(key) {
    return this.cache.get(key);
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

  clear() {
    return this.cache.flushAll();
  }
}

// Export a singleton instance
module.exports = new Cache(); 