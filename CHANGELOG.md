# Changelog

All notable MuleForge changes are documented here.

## [Unreleased]

### Added

- Requirement model for converting user requirements into structured project metadata.
- Adaptive question planning for missing operations, fields, validation, backend behavior and error cases.
- `muleforge verify` quality gate with requirement-to-generated-project coverage checks.
- Generated project documentation under `docs/`.
- Public documentation guidance for installation, generation, verification and deployment.

### Improved

- Requirement-driven generation no longer needs to assume a fixed Customer API as the project definition.
- Verification reports explain missing implementation coverage instead of only reporting file existence.

### Known limitations

- Some connector business operations are still being expanded.
- Full runtime validation requires a Mule/Maven environment and appropriate connector credentials.
- The development branch is not yet the stable 1.0 release.

## [0.2.0]

Initial MuleForge generator foundation and project templates.
