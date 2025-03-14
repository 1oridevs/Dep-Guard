# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2024-03-14

### Fixed
- Added README to npm package
- Fixed package.json formatting issues

## [1.0.0] - 2024-03-14

### Added
- Initial release with core functionality
- Dependency analysis and scanning
- Security vulnerability checking
- License compliance validation
- Update management
- CI/CD integration
- Multiple report formats
- Interactive CLI mode

### Security
- Comprehensive security scanning
- License validation
- Policy enforcement 

## [1.0.2] - 2024-03-14

### Added
- New `fix` command to automatically fix dependency issues
  - Automatic security vulnerability fixes
  - Safe package updates (patch and minor versions)
  - Dry-run mode to preview changes
  - Interactive confirmation prompts 
- New `tree` command for dependency visualization and analysis
  - Visual dependency tree display
  - Circular dependency detection
  - Duplicate dependency finder
  - Dependency graph generation (SVG output)
  - JSON output option
  - Configurable depth level 
