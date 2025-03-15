const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('./logger');

class TestUtils {
  constructor() {
    this.testDir = '.depguard/tests';
    this.fixtures = path.join(__dirname, '../../tests/fixtures');
  }

  async setupTestEnvironment(options = {}) {
    try {
      await fs.mkdir(this.testDir, { recursive: true });
      await this.copyFixtures();
      await this.setupMockDependencies();
      return this.testDir;
    } catch (error) {
      logger.error('Failed to setup test environment:', error);
      throw error;
    }
  }

  async copyFixtures() {
    const fixtures = await fs.readdir(this.fixtures);
    for (const fixture of fixtures) {
      const src = path.join(this.fixtures, fixture);
      const dest = path.join(this.testDir, fixture);
      await fs.copyFile(src, dest);
    }
  }

  async setupMockDependencies() {
    const mockPackageJson = {
      name: 'test-project',
      dependencies: {
        'mock-package': '1.0.0',
        'test-lib': '2.0.0'
      }
    };

    await fs.writeFile(
      path.join(this.testDir, 'package.json'),
      JSON.stringify(mockPackageJson, null, 2)
    );
  }

  async runTests(type = 'all') {
    const command = this.getTestCommand(type);
    try {
      execSync(command, { stdio: 'inherit' });
      return true;
    } catch (error) {
      logger.error(`Tests failed (${type}):`, error);
      return false;
    }
  }

  getTestCommand(type) {
    switch (type) {
      case 'unit':
        return 'jest tests/unit';
      case 'integration':
        return 'jest tests/integration';
      case 'e2e':
        return 'jest tests/e2e';
      default:
        return 'jest';
    }
  }

  async cleanup() {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
    } catch (error) {
      logger.error('Failed to cleanup test environment:', error);
    }
  }
}

module.exports = new TestUtils(); 