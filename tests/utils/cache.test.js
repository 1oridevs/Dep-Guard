const Cache = require('../../src/utils/cache');
const NodeCache = require('node-cache');

jest.mock('node-cache');

describe('Cache', () => {
  let cache;

  beforeEach(() => {
    NodeCache.mockClear();
    cache = require('../../src/utils/cache');
  });

  it('should initialize with correct options', () => {
    expect(NodeCache).toHaveBeenCalledWith({
      stdTTL: 3600,
      checkperiod: 600,
      useClones: false
    });
  });

  describe('get', () => {
    it('should retrieve cached value', () => {
      const mockValue = { data: 'test' };
      NodeCache.prototype.get.mockReturnValue(mockValue);

      const result = cache.get('test-key');
      expect(result).toBe(mockValue);
      expect(NodeCache.prototype.get).toHaveBeenCalledWith('test-key');
    });
  });

  describe('set', () => {
    it('should set value with default TTL', () => {
      cache.set('test-key', 'test-value');
      expect(NodeCache.prototype.set).toHaveBeenCalledWith('test-key', 'test-value', 3600);
    });

    it('should set value with custom TTL', () => {
      cache.set('test-key', 'test-value', 7200);
      expect(NodeCache.prototype.set).toHaveBeenCalledWith('test-key', 'test-value', 7200);
    });
  });

  describe('del', () => {
    it('should delete cached value', () => {
      cache.del('test-key');
      expect(NodeCache.prototype.del).toHaveBeenCalledWith('test-key');
    });
  });

  describe('flush', () => {
    it('should flush all cached values', () => {
      cache.flush();
      expect(NodeCache.prototype.flushAll).toHaveBeenCalled();
    });
  });
}); 