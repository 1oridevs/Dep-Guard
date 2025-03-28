const updatePlanner = require('../../../../src/core/automation/update-planner');
const impactAnalyzer = require('../../../../src/core/analyzers/impact-analyzer');

jest.mock('../../../../src/core/analyzers/impact-analyzer');

describe('UpdatePlanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('planUpdates', () => {
    it('should create update plans ordered by impact', async () => {
      const mockDeps = {
        'pkg-1': '1.0.0',
        'pkg-2': '2.0.0'
      };

      impactAnalyzer.analyze.mockImplementation((pkg) => Promise.resolve({
        score: pkg === 'pkg-1' ? 10 : 20,
        latestVersion: '2.0.0',
        breaking: [],
        dependencies: []
      }));

      const plans = await updatePlanner.planUpdates(mockDeps);
      
      expect(plans[0].package).toBe('pkg-1');
      expect(plans[1].package).toBe('pkg-2');
    });

    it('should identify update types correctly', () => {
      expect(updatePlanner.getUpdateType('1.0.0', '1.0.1')).toBe('patch');
      expect(updatePlanner.getUpdateType('1.0.0', '1.1.0')).toBe('minor');
      expect(updatePlanner.getUpdateType('1.0.0', '2.0.0')).toBe('major');
    });
  });
}); 