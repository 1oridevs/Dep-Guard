const securityAnalyzer = require('../../../../src/core/analyzers/security-analyzer');
const axios = require('axios');
const cache = require('../../../../src/utils/cache');

jest.mock('axios');
jest.mock('../../../../src/utils/cache');

describe('SecurityAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockReturnValue(null);
  });

  describe('analyzeDependency', () => {
    it('should analyze package security', async () => {
      axios.get.mockResolvedValueOnce({ data: [] }); // No vulnerabilities

      const result = await securityAnalyzer.analyzeDependency('test-pkg', '1.0.0');
      
      expect(result).toHaveProperty('vulnerabilities');
      expect(result).toHaveProperty('supplyChainRisks');
      expect(result).toHaveProperty('malwareDetected');
      expect(result).toHaveProperty('sourceVerified');
      expect(result).toHaveProperty('score');
    });

    it('should detect vulnerabilities', async () => {
      const mockVuln = {
        id: 'TEST-1',
        vulnerable_versions: ['1.0.0'],
        severity: 'high'
      };
      
      axios.get.mockResolvedValueOnce({ data: [mockVuln] });

      const result = await securityAnalyzer.analyzeDependency('test-pkg', '1.0.0');
      expect(result.vulnerabilities).toContainEqual(mockVuln);
      expect(result.score).toBeLessThan(100);
    });

    it('should detect supply chain risks', async () => {
      // Mock ownership changes
      const mockHistory = {
        recentChange: true,
        lastChanged: new Date()
      };

      securityAnalyzer.getOwnershipHistory = jest.fn().mockResolvedValue(mockHistory);
      
      const result = await securityAnalyzer.analyzeDependency('test-pkg', '1.0.0');
      expect(result.supplyChainRisks.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
    });
  });
}); 