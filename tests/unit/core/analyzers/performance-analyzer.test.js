const performanceAnalyzer = require('../../../../src/core/analyzers/performance-analyzer');
const bundleAnalyzer = require('../../../../src/core/analyzers/bundle-analyzer');
const cache = require('../../../../src/utils/cache');

jest.mock('../../../../src/core/analyzers/bundle-analyzer');
jest.mock('../../../../src/utils/cache');

describe('PerformanceAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockReturnValue(null);
  });

  describe('analyzePackage', () => {
    it('should analyze package performance', async () => {
      bundleAnalyzer.analyzeBundleSize.mockResolvedValue({
        size: 50000,
        gzip: 15000
      });

      const result = await performanceAnalyzer.analyzePackage('test-pkg', '1.0.0');
      
      expect(result).toHaveProperty('bundleMetrics');
      expect(result).toHaveProperty('runtimeMetrics');
      expect(result).toHaveProperty('memoryMetrics');
      expect(result).toHaveProperty('loadTimeMetrics');
      expect(result).toHaveProperty('treeShakingMetrics');
      expect(result).toHaveProperty('score');
    });

    it('should calculate accurate bundle impact', async () => {
      const mockBundleStats = {
        size: 50000,
        gzip: 15000,
        treeShakenSize: 35000
      };

      bundleAnalyzer.analyzeBundleSize.mockResolvedValue(mockBundleStats);

      const result = await performanceAnalyzer.analyzePackage('test-pkg', '1.0.0');
      expect(result.bundleMetrics.rawSize).toBe(50000);
      expect(result.bundleMetrics.gzipSize).toBe(15000);
      expect(result.score).toBeLessThan(100);
    });

    it('should detect memory issues', async () => {
      const mockMemoryStats = {
        heap: 50000000,
        leaks: true,
        gcFreq: 'high'
      };

      performanceAnalyzer.collectMemoryStats = jest.fn().mockResolvedValue(mockMemoryStats);

      const result = await performanceAnalyzer.analyzePackage('test-pkg', '1.0.0');
      expect(result.memoryMetrics.leakPotential).toBe(true);
      expect(result.score).toBeLessThan(70);
    });
  });
}); 