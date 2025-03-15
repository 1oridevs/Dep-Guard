const fileUtils = require('../../../src/utils/file-utils');
const fs = require('fs').promises;
const path = require('path');

describe('FileUtils', () => {
  const testDir = path.join(__dirname, 'test-files');
  const testFile = path.join(testDir, 'test.json');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true });
  });

  describe('readJsonSafe', () => {
    it('should read and parse JSON file', async () => {
      const testData = { test: 'value' };
      await fs.writeFile(testFile, JSON.stringify(testData));

      const result = await fileUtils.readJsonSafe(testFile);
      expect(result).toEqual(testData);
    });

    it('should return default value for non-existent file', async () => {
      const defaultValue = { default: true };
      const result = await fileUtils.readJsonSafe('nonexistent.json', defaultValue);
      expect(result).toEqual(defaultValue);
    });
  });

  describe('writeJsonSafe', () => {
    it('should write JSON data and create backup', async () => {
      const testData = { test: 'backup' };
      await fileUtils.writeJsonSafe(testFile, testData, { backup: true });

      const written = await fs.readFile(testFile, 'utf8');
      expect(JSON.parse(written)).toEqual(testData);

      const backups = await fs.readdir(testDir);
      expect(backups.some(f => f.startsWith('test.json.backup'))).toBe(true);
    });
  });

  describe('getFileHash', () => {
    it('should generate consistent file hash', async () => {
      const content = 'test content';
      await fs.writeFile(testFile, content);

      const hash1 = await fileUtils.getFileHash(testFile);
      const hash2 = await fileUtils.getFileHash(testFile);
      expect(hash1).toBe(hash2);
    });
  });
}); 