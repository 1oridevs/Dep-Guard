# Dependency Guardian

[![Test](https://github.com/oridevs/dependency-guardian/actions/workflows/test.yml/badge.svg)](https://github.com/oridevs/dependency-guardian/actions/workflows/test.yml)
[![CodeQL](https://github.com/oridevs/dependency-guardian/actions/workflows/codeql.yml/badge.svg)](https://github.com/oridevs/dependency-guardian/actions/workflows/codeql.yml)
[![npm version](https://badge.fury.io/js/dependency-guardian.svg)](https://badge.fury.io/js/dependency-guardian)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/oridevs/dependency-guardian/branch/main/graph/badge.svg)](https://codecov.io/gh/oridevs/dependency-guardian)

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

## Features

- **Dependency Scanning**: Identify outdated packages and suggest updates.
- **Security Vulnerabilities**: Integrate with npm audit to check for known vulnerabilities.
- **License Compliance**: Check dependencies against allowed and forbidden licenses.
- **Advanced Analysis**: Perform dependency tree analysis, circular dependency detection, bundle size impact analysis, and duplicate dependency detection.
- **CI/CD Integration**: Easily integrate with GitHub Actions and GitLab CI.
- **Custom Configuration**: Define your own rules and policies for dependency management.
- **User Preferences**: Save and load user preferences for themes and verbosity.
- **Interactive Mode**: Provides an interactive command-line interface for managing dependencies.

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
  }
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

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
