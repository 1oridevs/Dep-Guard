const fs = require('fs').promises;
const path = require('path');
const offlineUtils = require('../../../src/utils/offline-utils');

describe('OfflineUtils', () => {
  const testDir = path.join(__dirname, '../../fixtures/offline-test');
  
  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    offlineUtils.cacheDir = testDir;
  });

  it('should save and retrieve package data', async () => {
    const testData = { name: 'test-pkg', version: '1.0.0' };
    await offlineUtils.savePackageData('test-pkg', testData);
    
    const retrieved = await offlineUtils.getPackageData('test-pkg');
    expect(retrieved).toEqual(testData);
  });

  it('should handle missing package data', async () => {
    const data = await offlineUtils.getPackageData('nonexistent');
    expect(data).toBeNull();
  });

  it('should warn about old cache data', async () => {
    const testData = { name: 'old-pkg', version: '1.0.0' };
    const filePath = path.join(testDir, 'old-pkg.json');
    
    await fs.writeFile(filePath, JSON.stringify({
      data: testData,
      timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days old
    }));

    const data = await offlineUtils.getPackageData('old-pkg');
    expect(data).toEqual(testData);
  });

  it('should handle corrupted cache files', async () => {
    const filePath = path.join(testDir, 'corrupt-pkg.json');
    await fs.writeFile(filePath, 'invalid json');
    
    const data = await offlineUtils.getPackageData('corrupt-pkg');
    expect(data).toBeNull();
  });

  it('should handle cache directory creation errors', async () => {
    const originalCacheDir = offlineUtils.cacheDir;
    offlineUtils.cacheDir = '/root/invalid'; // Should fail due to permissions
    
    await expect(offlineUtils.savePackageData('test', {}))
      .rejects
      .toThrow();
      
    offlineUtils.cacheDir = originalCacheDir;
  });

  it('should respect maxAge setting', async () => {
    const customUtils = new OfflineUtils({ maxAge: 1000 }); // 1 second
    await customUtils.savePackageData('test', { data: 'test' });
    
    await new Promise(resolve => setTimeout(resolve, 1100));
    const data = await customUtils.getPackageData('test');
    expect(data).toBeNull();
  });
}); 