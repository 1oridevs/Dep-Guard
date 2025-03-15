const fs = require('fs').promises;
const path = require('path');
const fsUtils = require('../../../src/utils/fs-utils');

describe('FileSystemUtils', () => {
  const testDir = path.join(__dirname, 'test-files');
  const testFile = path.join(testDir, 'test.json');

  beforeAll(async () => {
    await fsUtils.ensureDirectory(testDir);
  });

  afterAll(async () => {
    await fs.rmdir(testDir, { recursive: true });
  });

  describe('readJsonFile', () => {
    it('should read and parse JSON file', async () => {
      const testData = { test: 'data' };
      await fsUtils.writeJsonFile(testFile, testData);
      const result = await fsUtils.readJsonFile(testFile);
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent file', async () => {
      const result = await fsUtils.readJsonFile('nonexistent.json');
      expect(result).toBeNull();
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON data to file', async () => {
      const testData = { test: 'write' };
      await fsUtils.writeJsonFile(testFile, testData);
      const content = await fs.readFile(testFile, 'utf8');
      expect(JSON.parse(content)).toEqual(testData);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const exists = await fsUtils.fileExists(testFile);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await fsUtils.fileExists('nonexistent.json');
      expect(exists).toBe(false);
    });
  });
}); 