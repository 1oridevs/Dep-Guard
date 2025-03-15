module.exports = {
  // Core settings
  debug: false,
  silent: false,

  // Policy rules
  policy: {
    dependencies: {
      maxAge: 365,
      allowedUpdateTypes: ['patch', 'minor'],
      blockedPackages: []
    },
    security: {
      maxVulnerabilityLevel: 'moderate',
      autofix: false,
      exceptions: []
    },
    licenses: {
      allowed: ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause'],
      blocked: ['GPL', 'AGPL'],
      unknown: 'warn'
    }
  },

  // Output settings
  output: {
    format: 'table',
    colors: true
  },

  // Cache settings
  cache: {
    enabled: true,
    ttl: 3600 // 1 hour
  },

  monitoring: {
    enabled: true,
    interval: '1h',
    notifications: {
      slack: {
        enabled: false,
        webhook: ''
      },
      discord: {
        enabled: false,
        webhook: ''
      },
      email: {
        enabled: false,
        recipients: []
      }
    }
  },

  updates: {
    autoUpdate: false,
    schedule: '0 0 * * *', // Daily at midnight
    testCommand: 'npm test',
    rollbackOnFailure: true,
    createPullRequest: true
  },

  performance: {
    trackBundleSize: true,
    historyRetention: '90d',
    alertThreshold: 10 // Percentage increase
  },

  scoring: {
    weights: {
      security: 0.4,
      maintenance: 0.3,
      popularity: 0.2,
      performance: 0.1
    },
    minimumScore: 70
  }
}; 