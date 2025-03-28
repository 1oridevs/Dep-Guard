const fs = require('fs').promises;
const path = require('path');
const offlineUtils = require('../../../src/utils/offline-utils');

describe('OfflineUtils', () => {
  const testDir = '.depguard/test-offline';
  const testPackage = 'test-package';
  const testData = { version: '1.0.0', description: 'Test package' };

  beforeAll(async () => {
    offlineUtils.cacheDir = testDir;
    await offlineUtils.init();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await offlineUtils.clearCache();
  });

  test('should save and retrieve package data', async () => {
    await offlineUtils.savePackageData(testPackage, testData);
    const retrieved = await offlineUtils.getPackageData(testPackage);
    expect(retrieved).toEqual(testData);
  });

  test('should handle missing package data', async () => {
    const data = await offlineUtils.getPackageData('nonexistent-package');
    expect(data).toBeNull();
  });

  test('should delete package data', async () => {
    await offlineUtils.savePackageData(testPackage, testData);
    await offlineUtils.deletePackageData(testPackage);
    const data = await offlineUtils.getPackageData(testPackage);
    expect(data).toBeNull();
  });

  test('should clear all cached data', async () => {
    await offlineUtils.savePackageData('pkg1', testData);
    await offlineUtils.savePackageData('pkg2', testData);
    await offlineUtils.clearCache();
    
    const data1 = await offlineUtils.getPackageData('pkg1');
    const data2 = await offlineUtils.getPackageData('pkg2');
    expect(data1).toBeNull();
    expect(data2).toBeNull();
  });

  test('should handle invalid cache directory', async () => {
    offlineUtils.cacheDir = '/root/invalid'; // Should fail due to permissions
    
    await expect(offlineUtils.savePackageData('test', {}))
      .rejects
      .toThrow();
  });

  test('should respect maxAge setting', async () => {
    const customUtils = new OfflineUtils({ maxAge: 1000 }); // 1 second
    await customUtils.savePackageData('test', { data: 'test' });
    
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const data = await customUtils.getPackageData('test');
    expect(data).toBeNull();
  });

  test('should handle corrupted cache files', async () => {
    const cachePath = path.join(testDir, `${testPackage}.json`);
    await fs.writeFile(cachePath, 'invalid json');
    
    const data = await offlineUtils.getPackageData(testPackage);
    expect(data).toBeNull();
  });
}); 