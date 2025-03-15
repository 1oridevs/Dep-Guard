# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [1.0.1] - 2024-03-14
### Added
- Moved the README to the root of the project.


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

## [1.1.0] - 2024-03-14

### Added
- New `report` command for comprehensive reporting
  - Multiple output formats (HTML, JSON, PDF, Markdown)
  - Custom templates support
  - Comparative analysis
  - Asset generation
- New `policy` command for policy management
  - Policy initialization wizard
  - Compliance checking
  - Rule management
  - Multiple policy types support
- New `audit` command for detailed security analysis
  - Configurable severity levels
  - Automatic vulnerability fixing
  - JSON and file report outputs
- New `init` command for easy configuration setup
  - Interactive prompts for settings
  - Template configuration generation
- Enhanced dependency analysis
  - Bundle size tracking
  - Impact analysis
  - Size optimization suggestions
- Improved error handling and reporting
- Better progress indicators
- Configuration validation

### Fixed
- Issue with circular dependency detection
- Performance improvements in tree analysis
- Better handling of npm audit results
- Fixed bundle size analysis accuracy
- Improved version checking reliability

### Security
- Enhanced security scanning capabilities
- Added policy-based security controls
- Improved vulnerability reporting


## [1.1.1] - 2025-03-15

### Added
- New `audit` command for detailed security analysis
  - Configurable severity levels
  - Automatic vulnerability fixing
  - JSON and file report outputs
- New `init` command for easy configuration setup
  - Interactive prompts for settings
  - Template configuration generation
- Enhanced dependency analysis
  - Bundle size tracking
  - Impact analysis
  - Size optimization suggestions
- Improved error handling and reporting
- Better progress indicators
- Configuration validation
- New Logo
- Small Fixes to the README


## [1.1.2] - 2025-03-15

### Added
- Added retry mechanism for failed network requests
- Added support for custom registry URLs
- Added improved caching system
- Added better error messages and debug information
- Added offline mode support
- Added lock file analysis
- Added configuration validation
- Added performance metrics collection
- Added dependency graph visualization
- Added interactive graph viewer
- Added SVG export functionality
- Added node coloring based on package health
- Added dg alias for depguard

### Fixed
- Bug Fixes
- Improved error handling in network requests
- Fixed timeout issues in dependency scanning
- Fixed package.json validation
