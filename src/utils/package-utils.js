const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('./logger');

class PackageUtils {
  constructor() {
    this.supportedManagers = ['npm', 'yarn', 'pnpm'];
  }

  async detectPackageManager() {
    try {
      // Check for lock files
      const files = await fs.readdir(process.cwd());
      if (files.includes('yarn.lock')) return 'yarn';
      if (files.includes('pnpm-lock.yaml')) return 'pnpm';
      if (files.includes('package-lock.json')) return 'npm';

      // Default to npm
      return 'npm';
    } catch (error) {
      logger.error('Failed to detect package manager:', error);
      return 'npm';
    }
  }

  async installDependencies(dependencies, options = {}) {
    const {
      dev = false,
      exact = false,
      manager = await this.detectPackageManager()
    } = options;

    const cmd = this.buildInstallCommand(dependencies, { dev, exact, manager });
    
    try {
      const { stdout, stderr } = await execPromise(cmd);
      return { success: true, output: stdout };
    } catch (error) {
      logger.error('Installation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async uninstallDependencies(dependencies, options = {}) {
    const {
      manager = await this.detectPackageManager()
    } = options;

    const cmd = this.buildUninstallCommand(dependencies, { manager });
    
    try {
      const { stdout, stderr } = await execPromise(cmd);
      return { success: true, output: stdout };
    } catch (error) {
      logger.error('Uninstallation failed:', error);
      return { success: false, error: error.message };
    }
  }

  buildInstallCommand(dependencies, options) {
    const { dev, exact, manager } = options;
    const deps = Array.isArray(dependencies) ? dependencies : [dependencies];

    switch (manager) {
      case 'yarn':
        return `yarn add ${dev ? '-D' : ''} ${exact ? '--exact' : ''} ${deps.join(' ')}`;
      case 'pnpm':
        return `pnpm add ${dev ? '-D' : ''} ${exact ? '--save-exact' : ''} ${deps.join(' ')}`;
      default: // npm
        return `npm install ${dev ? '--save-dev' : '--save'} ${exact ? '--save-exact' : ''} ${deps.join(' ')}`;
    }
  }

  buildUninstallCommand(dependencies, options) {
    const { manager } = options;
    const deps = Array.isArray(dependencies) ? dependencies : [dependencies];

    switch (manager) {
      case 'yarn':
        return `yarn remove ${deps.join(' ')}`;
      case 'pnpm':
        return `pnpm remove ${deps.join(' ')}`;
      default: // npm
        return `npm uninstall ${deps.join(' ')}`;
    }
  }
}

module.exports = new PackageUtils(); 