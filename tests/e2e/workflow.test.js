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
    await fs.mkdir(path.join(testProjectPath, 'reports'), { recursive: true });
    
    // Create package.json
    await fs.writeFile(
      path.join(testProjectPath, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          'chalk': '^4.1.2',
          'axios': '^1.6.0'
        }
      }, null, 2)
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  it('Full analysis workflow', async () => {
    // Run analyze command
    const { stdout: analyzeOutput } = await execPromise(`node ${CLI_PATH} analyze --json`, {
      cwd: testProjectPath
    });
    
    expect(() => JSON.parse(analyzeOutput)).not.toThrow();
    const analysisResult = JSON.parse(analyzeOutput);
    expect(analysisResult).toHaveProperty('dependencies');
    expect(analysisResult).toHaveProperty('summary');
  });

  it('Report generation workflow', async () => {
    const reportsDir = path.join(testProjectPath, 'reports');
    const reportPath = path.join(reportsDir, 'report.json');

    // Generate report
    await execPromise(`node ${CLI_PATH} analyze --json --output ${reportPath}`, {
      cwd: testProjectPath
    });

    // Verify report exists and is valid JSON
    const reportContent = await fs.readFile(reportPath, 'utf8');
    expect(() => JSON.parse(reportContent)).not.toThrow();
    const report = JSON.parse(reportContent);
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('dependencies');
  });
}); 