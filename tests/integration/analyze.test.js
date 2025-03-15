const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/index.js');

describe('analyze command', () => {
  const testDir = path.join(__dirname, '../fixtures/test-project');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          'test-dep': '^1.0.0'
        }
      })
    );
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('should analyze dependencies in test project', async () => {
    const { stdout, stderr } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: testDir
    });
    expect(stderr).toBe('');
    expect(stdout).toContain('Dependency Analysis Report');
  });

  test('should handle project with no dependencies', async () => {
    const emptyProjectPath = path.join(__dirname, '../fixtures/empty-project');
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: emptyProjectPath
    });

    expect(stdout).toContain('No dependencies found');
  });

  test('should respect --json flag', async () => {
    const testProjectPath = path.join(__dirname, '../fixtures/test-project');
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testProjectPath
    });

    expect(() => JSON.parse(stdout)).not.toThrow();
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('dependencies');
  });
}); 