const fs = require('fs').promises;
const path = require('path');
const CacheManager = require('../../../../src/core/managers/cache-manager');
const { CacheError } = require('../../../../src/utils/error-utils');

describe('CacheManager', () => {
  const testDir = path.join(__dirname, '../../../fixtures/cache-test');
  const testPath = path.join(testDir, 'test-cache.json');
  let cacheManager;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    cacheManager = new CacheManager({
      ttl: 100,
      persistPath: testPath
    });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });

  describe('Basic Operations', () => {
    it('should get and set values', () => {
      cacheManager.set('test', 'value');
      expect(cacheManager.get('test')).toBe('value');
    });

    it('should handle cache misses', () => {
      expect(cacheManager.get('nonexistent')).toBeUndefined();
    });

    it('should respect TTL', async () => {
      cacheManager.set('test', 'value', 1); // 1 second TTL
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(cacheManager.get('test')).toBeUndefined();
    });
  });

  describe('Async Operations', () => {
    it('should handle async fetch function', async () => {
      const fetchFn = jest.fn().mockResolvedValue('fetched');
      const value = await cacheManager.get('test', fetchFn);
      expect(value).toBe('fetched');
      expect(fetchFn).toHaveBeenCalled();
    });

    it('should cache async results', async () => {
      const fetchFn = jest.fn().mockResolvedValue('fetched');
      await cacheManager.get('test', fetchFn);
      await cacheManager.get('test', fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should handle fetch errors', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('Fetch failed'));
      await expect(cacheManager.get('test', fetchFn))
        .rejects
        .toThrow('Fetch failed');
    });
  });

  describe('Persistence', () => {
    it('should persist cache to disk', async () => {
      await cacheManager.set('test', 'value');
      await cacheManager.persistCache();
      
      const data = await fs.readFile(testPath, 'utf8');
      const cached = JSON.parse(data);
      expect(cached).toHaveProperty('test', 'value');
    });

    it('should load persisted cache', async () => {
      const data = { test: 'value' };
      await fs.writeFile(testPath, JSON.stringify(data));
      
      const newCache = new CacheManager({ persistPath: testPath });
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for async load
      
      expect(newCache.get('test')).toBe('value');
    });
  });

  describe('Batch Operations', () => {
    it('should handle multiple gets', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        'key1': 'value1',
        'key2': 'value2'
      });

      const results = await cacheManager.mget(['key1', 'key2'], fetchFn);
      expect(results).toEqual({
        'key1': 'value1',
        'key2': 'value2'
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should handle partial cache hits', async () => {
      cacheManager.set('key1', 'cached');
      const fetchFn = jest.fn().mockResolvedValue({
        'key2': 'fetched'
      });

      const results = await cacheManager.mget(['key1', 'key2'], fetchFn);
      expect(results).toEqual({
        'key1': 'cached',
        'key2': 'fetched'
      });
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', async () => {
      cacheManager.set('test', 'value');
      cacheManager.get('test');
      cacheManager.get('missing');

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should track errors', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('Fetch failed'));
      try {
        await cacheManager.get('test', fetchFn);
      } catch (error) {
        // Ignore error
      }

      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });
}); 