const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/index.js');

describe('End-to-End Workflows', () => {
  const testProjectDir = path.join(__dirname, '../fixtures/test-project');
  const reportsDir = path.join(testProjectDir, 'reports');

  beforeAll(async () => {
    // Create test project structure
    await fs.mkdir(testProjectDir, { recursive: true });
    await fs.mkdir(reportsDir, { recursive: true });

    // Create test package.json
    await fs.writeFile(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21',
          'chalk': '^4.1.2'
        },
        devDependencies: {
          'jest': '^27.0.0'
        }
      }, null, 2)
    );

    // Create node_modules to simulate installed dependencies
    await fs.mkdir(path.join(testProjectDir, 'node_modules'), { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });

  beforeEach(async () => {
    // Clean reports directory before each test
    const files = await fs.readdir(reportsDir);
    await Promise.all(
      files.map(file => fs.unlink(path.join(reportsDir, file)))
    );
  });

  it('should analyze dependencies and generate valid JSON output', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testProjectDir
    });

    expect(() => JSON.parse(stdout)).not.toThrow();
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('dependencies');
    expect(Array.isArray(result.dependencies)).toBe(true);
  });

  it('should generate and save analysis report', async () => {
    const reportPath = path.join(reportsDir, 'analysis.json');
    
    await execPromise(
      `node ${CLI_PATH} analyze --json --output ${reportPath}`,
      { cwd: testProjectDir }
    );

    // Verify report exists and is valid JSON
    const reportContent = await fs.readFile(reportPath, 'utf8');
    expect(() => JSON.parse(reportContent)).not.toThrow();
    const report = JSON.parse(reportContent);
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('dependencies');
  });

  it('should handle scan command with security checks', async () => {
    const { stdout } = await execPromise(`node ${CLI_PATH} scan --json`, {
      cwd: testProjectDir
    });

    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('security');
    expect(result).toHaveProperty('licenses');
  });

  it('should run full workflow with multiple commands', async () => {
    // Run sequence of commands
    const commands = [
      'analyze --json',
      'scan --json',
      'audit --json',
      'tree --json'
    ];

    for (const cmd of commands) {
      const { stdout } = await execPromise(`node ${CLI_PATH} ${cmd}`, {
        cwd: testProjectDir
      });

      // Verify each command produces valid JSON
      expect(() => JSON.parse(stdout)).not.toThrow();
      const result = JSON.parse(stdout);
      expect(result).toBeTruthy();
    }
  });

  it('should handle errors gracefully', async () => {
    // Test with invalid project
    const invalidDir = path.join(__dirname, '../fixtures/invalid-project');
    await fs.mkdir(invalidDir, { recursive: true });

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

  it('should respect concurrent operations', async () => {
    // Run multiple commands concurrently
    const commands = [
      'analyze --json',
      'scan --json',
      'audit --json'
    ];

    const results = await Promise.all(
      commands.map(cmd => 
        execPromise(`node ${CLI_PATH} ${cmd}`, {
          cwd: testProjectDir
        })
      )
    );

    // Verify all commands completed successfully
    results.forEach(({ stdout }) => {
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  });
}); 