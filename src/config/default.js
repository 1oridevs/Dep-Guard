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
  }
}; 