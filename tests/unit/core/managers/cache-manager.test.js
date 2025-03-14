const cache = require('../../../../src/core/managers/cache-manager');

describe('CacheManager', () => {
  beforeEach(() => {
    cache.flush();
  });

  test('should set and get values', () => {
    cache.set('test-key', 'test-value');
    expect(cache.get('test-key')).toBe('test-value');
  });

  test('should respect TTL', async () => {
    cache.set('test-key', 'test-value', 1); // 1 second TTL
    expect(cache.get('test-key')).toBe('test-value');
    
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cache.get('test-key')).toBeUndefined();
  });

  test('should track hits and misses', () => {
    cache.set('test-key', 'test-value');
    
    cache.get('test-key'); // hit
    cache.get('missing-key'); // miss
    
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
}); 