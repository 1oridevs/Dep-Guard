const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/index.js');

describe('analyze command', () => {
  const testDir = path.join(__dirname, '../fixtures/test-project');
  const emptyDir = path.join(__dirname, '../fixtures/empty-project');

  beforeAll(async () => {
    // Create test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(emptyDir, { recursive: true });

    // Create test package.json files
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          'test-dep': '1.0.0'
        }
      })
    );

    await fs.writeFile(
      path.join(emptyDir, 'package.json'),
      JSON.stringify({
        name: 'empty-project',
        dependencies: {}
      })
    );
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  test('should show analysis report for project with dependencies', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: testDir
    });

    expect(stdout).toContain('Dependency Analysis Report');
    expect(stdout).toContain('test-dep');
  });

  test('should handle project with no dependencies', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: emptyDir
    });

    expect(stdout).toContain('No dependencies found');
  });

  test('should respect --json flag', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testDir
    });

    expect(() => JSON.parse(stdout)).not.toThrow();
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('dependencies');
    expect(result.dependencies).toBeInstanceOf(Array);
  });

  test('should write output to file when specified', async () => {
    const outputFile = path.join(testDir, 'report.json');
    await execPromise(`node ${CLI_PATH} analyze --json --output ${outputFile}`, {
      cwd: testDir
    });

    const content = await fs.readFile(outputFile, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  test('should exit with code 1 in strict mode with issues', async () => {
    await expect(
      execPromise(`node ${CLI_PATH} analyze --strict`, {
        cwd: testDir
      })
    ).rejects.toThrow();
  });
}); 