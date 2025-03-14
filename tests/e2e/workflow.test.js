const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/index.js');

describe('End-to-End Workflows', () => {
  const testProjectPath = path.join(__dirname, '../fixtures/test-project');

  test('Full analysis workflow', async () => {
    // Run analyze command
    const { stdout: analyzeOutput } = await execPromise(`node ${CLI_PATH} analyze`, {
      cwd: testProjectPath
    });
    expect(analyzeOutput).toContain('Dependency Analysis Report');

    // Run scan command
    const { stdout: scanOutput } = await execPromise(`node ${CLI_PATH} scan`, {
      cwd: testProjectPath
    });
    expect(scanOutput).toContain('Scan complete');

    // Run CI command
    const { stdout: ciOutput } = await execPromise(`node ${CLI_PATH} ci`, {
      cwd: testProjectPath
    });
    expect(ciOutput).toContain('CI checks');
  });

  test('Report generation workflow', async () => {
    const reportPath = path.join(testProjectPath, 'report.json');

    // Generate JSON report
    await execPromise(`node ${CLI_PATH} analyze --json > ${reportPath}`, {
      cwd: testProjectPath
    });

    // Verify report content
    const reportContent = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportContent);
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('dependencies');

    // Cleanup
    await fs.unlink(reportPath);
  });
}); 