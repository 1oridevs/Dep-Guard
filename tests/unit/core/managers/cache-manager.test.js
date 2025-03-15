const fs = require('fs').promises;
const path = require('path');
const cacheManager = require('../../../../src/core/managers/cache-manager');

describe('CacheManager', () => {
  const testDir = '.depguard/test-cache';
  
  beforeAll(async () => {
    cacheManager.cacheDir = testDir;
    await cacheManager.init();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await cacheManager.clear();
  });

  test('should store and retrieve values', async () => {
    const key = 'test-key';
    const value = { data: 'test-value' };

    await cacheManager.set(key, value);
    const retrieved = await cacheManager.get(key);

    expect(retrieved).toEqual(value);
  });

  test('should handle cache expiration', async () => {
    const key = 'expiring-key';
    const value = { data: 'expiring-value' };

    await cacheManager.set(key, value, 100); // 100ms TTL
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const retrieved = await cacheManager.get(key);
    expect(retrieved).toBeNull();
  });

  test('should delete cached values', async () => {
    const key = 'delete-key';
    const value = { data: 'delete-value' };

    await cacheManager.set(key, value);
    await cacheManager.delete(key);
    
    const retrieved = await cacheManager.get(key);
    expect(retrieved).toBeNull();
  });

  test('should clear all cached values', async () => {
    const keys = ['key1', 'key2', 'key3'];
    const value = { data: 'test' };

    await Promise.all(keys.map(key => cacheManager.set(key, value)));
    await cacheManager.clear();

    const results = await Promise.all(keys.map(key => cacheManager.get(key)));
    expect(results.every(result => result === null)).toBe(true);
  });

  test('should cleanup expired entries', async () => {
    const keys = {
      fresh: { ttl: 1000 * 60 }, // 1 minute
      expired: { ttl: 100 } // 100ms
    };

    await Promise.all(
      Object.entries(keys).map(([key, { ttl }]) => 
        cacheManager.set(key, { data: key }, ttl)
      )
    );

    await new Promise(resolve => setTimeout(resolve, 150));
    await cacheManager.cleanup();

    expect(await cacheManager.get('fresh')).toBeTruthy();
    expect(await cacheManager.get('expired')).toBeNull();
  });
}); 