const NodeCache = require('node-cache');
const logger = require('../../utils/logger');
const fs = require('fs').promises;
const { CacheError } = require('../../utils/error-utils');

class CacheManager {
  constructor(options = {}) {
    this.cache = new NodeCache({
      stdTTL: options.ttl || 3600, // 1 hour default
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false,
      maxKeys: options.maxKeys || -1 // Unlimited by default
    });

    this.persistPath = options.persistPath;
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;

    // Load persisted cache if available
    if (this.persistPath) {
      this.loadPersistedCache();
    }

    this.cache.on('expired', (key, value) => {
      logger.debug(`Cache entry expired: ${key}`);
    });

    this.cache.on('flush', () => {
      logger.debug('Cache flushed');
    });
  }

  async loadPersistedCache() {
    try {
      const data = await fs.readFile(this.persistPath, 'utf8');
      const cached = JSON.parse(data);
      Object.entries(cached).forEach(([key, value]) => {
        this.set(key, value);
      });
      logger.debug('Loaded persisted cache');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to load persisted cache:', error.message);
      }
    }
  }

  async persistCache() {
    if (!this.persistPath) return;
    
    try {
      const data = {};
      this.cache.keys().forEach(key => {
        data[key] = this.cache.get(key);
      });
      await fs.writeFile(this.persistPath, JSON.stringify(data));
      logger.debug('Persisted cache to disk');
    } catch (error) {
      logger.error('Failed to persist cache:', error.message);
      throw new CacheError('Failed to persist cache', { error });
    }
  }

  async get(key, fetchFn) {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      logger.debug(`Cache hit: ${key}`);
      this.hits++;
      return cached;
    }

    logger.debug(`Cache miss: ${key}`);
    this.misses++;
    try {
      const value = await fetchFn();
      this.set(key, value);
      if (this.persistPath) {
        await this.persistCache();
      }
      return value;
    } catch (error) {
      this.errors++;
      logger.error(`Failed to fetch data for cache key ${key}:`, error.message);
      throw error;
    }
  }

  set(key, value, ttl) {
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
      errors: this.errors,
      keys: this.cache.keys().length,
      ...this.cache.getStats()
    };
  }

  async mget(keys, fetchFn) {
    const results = {};
    const missingKeys = [];

    keys.forEach(key => {
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        results[key] = cached;
        this.hits++;
      } else {
        missingKeys.push(key);
        this.misses++;
      }
    });

    if (missingKeys.length > 0) {
      try {
        const values = await fetchFn(missingKeys);
        Object.entries(values).forEach(([key, value]) => {
          results[key] = value;
          this.set(key, value);
        });
      } catch (error) {
        this.errors++;
        throw new CacheError('Failed to fetch multiple values', { 
          keys: missingKeys,
          error 
        });
      }
    }

    return results;
  }
}

module.exports = new CacheManager(); 