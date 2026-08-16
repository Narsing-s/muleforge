# Changelog

All notable MuleForge changes are documented here.

## [0.3.0] - Development

### Added

- Requirement model for converting user requirements into structured project metadata.
- Adaptive question planning for missing operations, fields, validation, backend behavior and error cases.
- `muleforge verify` quality gate with requirement-to-generated-project coverage checks.
- `muleforge verify --build` integration with Maven verification.
- Local `muleforge ui` command and a responsive MuleForge web workspace.
- Solution design, flow, API, test and verification views in the local UI.
- Web UI documentation at `docs/getting-started/web-ui.md`.
- Security guidance for public use.

### Improved

- Requirement-driven generation no longer needs to assume a fixed Customer API as the project definition.
- Verification reports explain missing implementation coverage instead of only reporting file existence.
- Package and CLI version aligned to `0.3.0`.

### Known limitations

- Some connector business operations are still being expanded.
- The current web UI is a local workspace preview; it does not yet replace Anypoint Studio or provide browser-based Mule runtime execution.
- Full runtime validation requires a Mule/Maven environment and appropriate connector credentials.
- The development branch is not yet the stable `1.0.0` release.

## [0.2.0]

Initial MuleForge generator foundation and project templates.
