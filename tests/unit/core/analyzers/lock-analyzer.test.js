const fs = require('fs').promises;
const path = require('path');
const lockAnalyzer = require('../../../../src/core/analyzers/lock-analyzer');

describe('LockAnalyzer', () => {
  const testDir = path.join(__dirname, '../../../fixtures/lock-test');
  
  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should analyze npm lock file', async () => {
    const lockContent = {
      lockfileVersion: 2,
      dependencies: {
        'test-pkg': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/test-pkg/-/test-pkg-1.0.0.tgz'
        }
      }
    };

    await fs.writeFile(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify(lockContent)
    );

    const result = await lockAnalyzer.analyzeLockFile(testDir);
    expect(result.npm).toBeTruthy();
    expect(result.npm.version).toBe(2);
  });

  it('should handle missing lock files', async () => {
    const result = await lockAnalyzer.analyzeLockFile(testDir);
    expect(result.npm).toBeNull();
    expect(result.yarn).toBeNull();
    expect(result.pnpm).toBeNull();
  });
}); 