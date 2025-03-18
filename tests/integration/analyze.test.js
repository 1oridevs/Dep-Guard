const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/index.js');

describe('analyze command integration', () => {
  const testDir = path.join(__dirname, '../fixtures/test-project');
  const emptyDir = path.join(__dirname, '../fixtures/empty-project');

  beforeAll(async () => {
    // Create test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(emptyDir, { recursive: true });

    // Create test project with dependencies
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21',
          'chalk': '^4.1.2'
        }
      }, null, 2)
    );

    // Create empty project
    await fs.writeFile(
      path.join(emptyDir, 'package.json'),
      JSON.stringify({
        name: 'empty-project',
        version: '1.0.0',
        dependencies: {}
      }, null, 2)
    );
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  it('should show formatted analysis report for project with dependencies', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: testDir
    });

    // Verify text output format
    expect(stdout).toContain('Dependency Analysis Report');
    expect(stdout).toContain('lodash');
    expect(stdout).toContain('chalk');
    expect(stdout).toMatch(/Version.*Latest.*Status/); // Header row
  });

  it('should handle project with no dependencies', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: emptyDir
    });

    expect(stdout).toContain('No dependencies found');
  });

  it('should output valid JSON when --json flag is used', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testDir
    });

    expect(() => JSON.parse(stdout)).not.toThrow();
    const result = JSON.parse(stdout);
    
    // Verify JSON structure
    expect(result).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        total: expect.any(Number),
        outdated: expect.any(Number),
        issues: expect.any(Number)
      }),
      dependencies: expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          version: expect.any(String),
          latestVersion: expect.any(String),
          status: expect.any(String)
        })
      ])
    }));
  });

  it('should write output to file when --output is specified', async () => {
    const outputFile = path.join(testDir, 'report.json');
    await execPromise(`node ${CLI_PATH} analyze --json --output ${outputFile}`, {
      cwd: testDir
    });

    const content = await fs.readFile(outputFile, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
    
    const report = JSON.parse(content);
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('dependencies');
  });

  it('should include dependency details in analysis', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testDir
    });

    const result = JSON.parse(stdout);
    const lodash = result.dependencies.find(d => d.name === 'lodash');
    
    expect(lodash).toBeTruthy();
    expect(lodash).toEqual(expect.objectContaining({
      name: 'lodash',
      version: expect.any(String),
      latestVersion: expect.any(String),
      status: expect.any(String)
    }));
  });

  it('should handle invalid package.json gracefully', async () => {
    const invalidDir = path.join(__dirname, '../fixtures/invalid-project');
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, 'package.json'),
      'invalid json'
    );

    try {
      await execPromise(`node ${CLI_PATH} analyze`, {
        cwd: invalidDir
      });
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).toContain('Error');
    } finally {
      await fs.rm(invalidDir, { recursive: true, force: true });
    }
  });

  it('should respect --strict flag for outdated dependencies', async () => {
    try {
      await execPromise(`node ${CLI_PATH} analyze --strict`, {
        cwd: testDir
      });
      fail('Should have thrown an error in strict mode');
    } catch (error) {
      expect(error.message).toContain('Error');
    }
  });
}); 