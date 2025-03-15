const impactAnalyzer = require('../../../src/utils/impact-analyzer');
const bundleAnalyzer = require('../../../src/core/analyzers/bundle-analyzer');

jest.mock('../../../src/core/analyzers/bundle-analyzer');

describe('ImpactAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeImpact', () => {
    it('should analyze package impact', async () => {
      bundleAnalyzer.analyzeBundleSize.mockResolvedValue({
        size: 50000,
        gzip: 15000
      });

      const impact = await impactAnalyzer.analyzeImpact('test-package', '^1.0.0');
      
      expect(impact).toHaveProperty('size');
      expect(impact).toHaveProperty('dependencies');
      expect(impact).toHaveProperty('breaking');
      expect(impact).toHaveProperty('security');
      expect(impact).toHaveProperty('score');
    });
  });

  describe('analyzeSizeImpact', () => {
    it('should analyze bundle size impact', async () => {
      bundleAnalyzer.analyzeBundleSize.mockResolvedValue({
        size: 50000,
        gzip: 15000
      });

      const sizeImpact = await impactAnalyzer.analyzeSizeImpact('test-package', '^1.0.0');
      
      expect(sizeImpact).toHaveProperty('size', 50000);
      expect(sizeImpact).toHaveProperty('gzip', 15000);
      expect(sizeImpact).toHaveProperty('percentage');
    });
  });
}); 