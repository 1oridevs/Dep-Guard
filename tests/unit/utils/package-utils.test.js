const packageUtils = require('../../../src/utils/package-utils');
const fs = require('fs').promises;
const path = require('path');

describe('PackageUtils', () => {
  describe('detectPackageManager', () => {
    const originalReaddir = fs.readdir;
    
    afterEach(() => {
      fs.readdir = originalReaddir;
    });

    it('should detect yarn', async () => {
      fs.readdir = jest.fn().mockResolvedValue(['yarn.lock']);
      const result = await packageUtils.detectPackageManager();
      expect(result).toBe('yarn');
    });

    it('should detect pnpm', async () => {
      fs.readdir = jest.fn().mockResolvedValue(['pnpm-lock.yaml']);
      const result = await packageUtils.detectPackageManager();
      expect(result).toBe('pnpm');
    });

    it('should default to npm', async () => {
      fs.readdir = jest.fn().mockResolvedValue([]);
      const result = await packageUtils.detectPackageManager();
      expect(result).toBe('npm');
    });
  });

  describe('buildInstallCommand', () => {
    it('should build npm install command', () => {
      const result = packageUtils.buildInstallCommand(['react', 'react-dom'], {
        dev: true,
        exact: true,
        manager: 'npm'
      });
      expect(result).toBe('npm install --save-dev --save-exact react react-dom');
    });

    it('should build yarn add command', () => {
      const result = packageUtils.buildInstallCommand('lodash', {
        manager: 'yarn'
      });
      expect(result).toBe('yarn add lodash');
    });
  });

  describe('buildUninstallCommand', () => {
    it('should build npm uninstall command', () => {
      const result = packageUtils.buildUninstallCommand(['react', 'react-dom'], {
        manager: 'npm'
      });
      expect(result).toBe('npm uninstall react react-dom');
    });

    it('should build yarn remove command', () => {
      const result = packageUtils.buildUninstallCommand('lodash', {
        manager: 'yarn'
      });
      expect(result).toBe('yarn remove lodash');
    });
  });
}); 