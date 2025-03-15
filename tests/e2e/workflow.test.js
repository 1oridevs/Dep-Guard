const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/index.js');

describe('End-to-End Workflows', () => {
  const testProjectPath = path.join(__dirname, '../fixtures/test-project');
  
  beforeAll(async () => {
    // Ensure test project directory exists
    await fs.mkdir(testProjectPath, { recursive: true });
    // Ensure test project has a package.json
    await fs.writeFile(
      path.join(testProjectPath, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'chalk': '^4.1.2',
          'axios': '^1.6.0'
        }
      }, null, 2)
    );
  });

  test('Full analysis workflow', async () => {
    // Run analyze command
    const { stdout: analyzeOutput } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testProjectPath
    });
    
    const analysisResult = JSON.parse(analyzeOutput);
    expect(analysisResult).toHaveProperty('dependencies');
    expect(analysisResult).toHaveProperty('summary');

    // Run scan command
    const { stdout: scanOutput } = await execPromise(`node ${CLI_PATH} scan --json`, {
      cwd: testProjectPath
    });
    expect(JSON.parse(scanOutput)).toHaveProperty('results');
  });

  test('Report generation workflow', async () => {
    const reportsDir = path.join(testProjectPath, 'reports');
    const reportPath = path.join(reportsDir, 'report.json');

    // Ensure reports directory exists
    await fs.mkdir(reportsDir, { recursive: true });

    // Generate JSON report
    await execPromise(`node ${CLI_PATH} analyze --json --output ${reportPath}`, {
      cwd: testProjectPath
    });

    // Verify report content
    const reportContent = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportContent);
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('dependencies');

    // Cleanup
    await fs.rm(reportsDir, { recursive: true, force: true });
  });
}); 