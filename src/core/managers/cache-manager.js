const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { CacheError } = require('../../utils/error-utils');

class CacheManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || '.depguard/cache';
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    this.initialized = false;
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;

    // Load persisted cache if available
    if (options.persistPath) {
      this.loadPersistedCache(options.persistPath);
    }
  }

  async init() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize cache directory:', error);
      throw error;
    }
  }

  generateKey(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  async set(key, value, ttl = this.maxAge) {
    await this.init();

    const cacheData = {
      value,
      expires: Date.now() + ttl
    };

    const cacheKey = this.generateKey(key);
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

    try {
      await fs.writeFile(cachePath, JSON.stringify(cacheData));
      return true;
    } catch (error) {
      logger.error('Cache write failed:', error);
      return false;
    }
  }

  async get(key) {
    await this.init();

    const cacheKey = this.generateKey(key);
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

    try {
      const data = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      
      if (Date.now() > data.expires) {
        await this.delete(key);
        return null;
      }

      this.hits++;
      return data.value;
    } catch (error) {
      this.misses++;
      return null;
    }
  }

  async delete(key) {
    const cacheKey = this.generateKey(key);
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

    try {
      await fs.unlink(cachePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async clear() {
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
      return true;
    } catch (error) {
      logger.error('Cache clear failed:', error);
      return false;
    }
  }

  async cleanup() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const now = Date.now();

      await Promise.all(
        files.map(async file => {
          const filePath = path.join(this.cacheDir, file);
          try {
            const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
            if (now > data.expires) {
              await fs.unlink(filePath);
            }
          } catch (error) {
            // Delete corrupted cache files
            await fs.unlink(filePath);
          }
        })
      );
      return true;
    } catch (error) {
      logger.error('Cache cleanup failed:', error);
      return false;
    }
  }

  async loadPersistedCache(persistPath) {
    try {
      const data = await fs.readFile(persistPath, 'utf8');
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
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(async file => {
          const filePath = path.join(this.cacheDir, file);
          const cached = JSON.parse(await fs.readFile(filePath, 'utf8'));
          data[file.split('.')[0]] = cached.value;
        })
      );
      await fs.writeFile(this.persistPath, JSON.stringify(data));
      logger.debug('Persisted cache to disk');
    } catch (error) {
      logger.error('Failed to persist cache:', error.message);
      throw new CacheError('Failed to persist cache', { error });
    }
  }

  async mget(keys, fetchFn) {
    const results = {};
    const missingKeys = [];

    await Promise.all(keys.map(async key => {
      const cached = await this.get(key);
      if (cached !== null) {
        results[key] = cached;
        this.hits++;
      } else {
        missingKeys.push(key);
        this.misses++;
      }
    }));

    if (missingKeys.length > 0) {
      try {
        const values = await fetchFn(missingKeys);
        await Promise.all(
          Object.entries(values).map(([key, value]) => this.set(key, value))
        );
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

  stats() {
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      keys: this.cacheDir.split('/').length,
      maxAge: this.maxAge,
      ...this.cacheDir.split('/').reduce((acc, dir) => {
        acc[dir] = {
          hits: 0,
          misses: 0,
          errors: 0,
          keys: 0
        };
        return acc;
      }, {})
    };
  }
}

module.exports = new CacheManager(); 