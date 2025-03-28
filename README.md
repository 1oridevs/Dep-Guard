# Dependency Guardian

<p align="center">
  <img src="assets/logo.svg" width="200" height="200" alt="Dependency Guardian Logo">
</p>

[![npm](https://img.shields.io/npm/v/dependency-guardian.svg)](https://www.npmjs.com/package/dependency-guardian)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dm/dependency-guardian.svg)](https://www.npmjs.com/package/dependency-guardian)
[![Node.js Version](https://img.shields.io/node/v/dependency-guardian.svg)](https://nodejs.org)

Dependency Guardian is a command-line tool designed to help developers manage their Node.js project dependencies. It scans for outdated packages, checks for security vulnerabilities, and ensures license compliance.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [CI/CD Integration](#cicd-integration)
- [Advanced Analysis](#advanced-analysis)
- [Contributing](#contributing)
- [License](#license)
- [Options](#options)

## Features

- **Dependency Scanning**: Identify outdated packages and suggest updates.
- **Security Vulnerabilities**: Integrate with npm audit to check for known vulnerabilities.
- **License Compliance**: Check dependencies against allowed and forbidden licenses.
- **Dependency Impact Analysis**:
  - Bundle size impact prediction
  - Breaking changes detection
  - Compatibility scoring
- **Smart Updates**:
  - Automated dependency updates with rollback
  - Intelligent update ordering
  - Test suite integration
- **Monitoring & Alerts**:
  - Real-time vulnerability monitoring
  - Slack/Discord/Email notifications
  - Custom webhook support
- **Performance Analysis**:
  - Bundle size tracking over time
  - Import cost analysis
  - Tree-shaking effectiveness
- **Policy Management**:
  - Team-wide dependency policies
  - Custom approval workflows
  - Policy templates
- **Dependency Health Score**:
  - Package quality metrics
  - Maintenance score
  - Community health indicators
- **Advanced Analysis**: Perform dependency tree analysis, circular dependency detection, bundle size impact analysis, and duplicate dependency detection.
- **CI/CD Integration**: Easily integrate with GitHub Actions and GitLab CI.
- **Custom Configuration**: Define your own rules and policies for dependency management.
- **User Preferences**: Save and load user preferences for themes and verbosity.
- **Interactive Mode**: Provides an interactive command-line interface for managing dependencies.
- **Offline Support**:
  - Work offline with cached package data
  - Configurable cache expiration
  - Automatic cache management
- **Lock File Analysis**:
  - Support for package-lock.json
  - Support for yarn.lock
  - Support for pnpm-lock.yaml
  - Dependency resolution validation
- **Performance Monitoring**:
  - Request timing metrics
  - Cache hit/miss tracking
  - Operation duration analysis
  - Custom metric collection

## Installation

To install Dependency Guardian, you can use npm:

```bash
npm install -g dependency-guardian
```

## Usage

To scan your project for outdated dependencies, navigate to your project directory and run:

```bash
dependency-guardian scan
```

For advanced analysis, use:

```bash
dependency-guardian analyze
```

To run in CI mode, use:

```bash
dependency-guardian ci
```

## Configuration

You can customize Dependency Guardian's behavior by creating a `.depguardrc.json` file in your project root. Here's an example configuration:

```json
{
  "allowedLicenses": [
    "MIT",
    "ISC",
    "Apache-2.0",
    "BSD-3-Clause"
  ],
  "maxVulnerability": "moderate",
  "updateLevel": "minor",
  "checks": {
    "security": true,
    "license": true,
    "updates": true
  },
  "ignorePackages": [],
  "ci": {
    "failOnIssues": true,
    "reportFormat": "junit",
    "createIssues": true
  },
  "registry": "https://registry.npmjs.org",
  "maxRetries": 3,
  "timeout": 30000,
  "offline": false,
  "cacheTimeout": 3600000,
  "cachePath": ".dependency-guardian",
  "strict": false
}
```

## CI/CD Integration

Dependency Guardian can be easily integrated into your CI/CD pipelines. Here are examples for GitHub Actions and GitLab CI:

### GitHub Actions

Create a `.github/workflows/dependency-guardian.yml` file:

```yaml
name: Dependency Guardian

on:
  push:
    paths:
      - 'package.json'
      - 'package-lock.json'
      - 'yarn.lock'
  pull_request:
    paths:
      - 'package.json'
      - 'package-lock.json'
      - 'yarn.lock'
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday
  workflow_dispatch: # Manual trigger

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run Dependency Guardian
        id: depguard
        run: npx dependency-guardian ci
      - name: Create GitHub Issue (if issues found)
        if: ${{ failure() && steps.depguard.outputs.hasIssues }}
        uses: actions/github-script@v7
        with:
          script: |
            const issues = JSON.parse(process.env.DEPGUARD_ISSUES);
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '🛡️ Dependency Guardian: Issues Found',
              body: issues.map(i => `- ${i.type}: ${i.message}`).join('\n'),
              labels: ['dependencies', 'security']
            });
```

### GitLab CI

Create a `.gitlab-ci.yml` file:

```yaml
dependency-scan:
  image: node:20
  stage: test
  script:
    - npm ci
    - npx dependency-guardian ci
  rules:
    - changes:
      - package.json
      - package-lock.json
      - yarn.lock
    - schedule: "0 0 * * 1"  # Weekly on Monday
  artifacts:
    reports:
      junit: dependency-report.xml 
```

## Advanced Analysis

To perform advanced analysis on your dependencies, use:

```bash
dependency-guardian analyze
```

This command will:
- Analyze the dependency tree.
- Detect circular dependencies.
- Analyze the bundle size impact of each dependency.
- Detect duplicate dependencies.

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](docs/LICENSE) file for details.

## Options

### Registry Configuration

You can configure a custom npm registry:

```bash
dg analyze --registry=https://custom-registry.com
```

### Network Options

- `--max-retries`: Maximum number of retry attempts (default: 3)
- `--timeout`: Request timeout in milliseconds (default: 30000)
- `--cache-timeout`: Cache timeout in milliseconds (default: 3600000)

```bash
dg analyze --max-retries=5 --timeout=60000
```
