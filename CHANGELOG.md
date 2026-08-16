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
- Connector dependency resolution for generated Maven projects.
- Real Database connector generation for Snowflake-backed customer create/read operations.
- Snowflake JDBC dependency support for the generic Database connector.
- Executable `customer-api` reference implementation with duplicate lookup, insert, read, validation and HTTP error responses.
- Reference Snowflake schema and implementation documentation.
- GitHub Actions CI quality gate for pull requests and protected branches.
- CI checks for CLI tests, MuleForge verification and secret hygiene.
- CI/CD documentation covering GitHub Actions, environments, secrets and deployment boundaries.
- CloudHub 2.0 DEV deployment profile for the reference `customer-api`.
- Manual GitHub Actions CloudHub 2.0 DEV deployment workflow using GitHub Environment secrets.
- CloudHub 2.0 deployment documentation and security guidance.

### Improved

- Requirement-driven generation no longer needs to assume a fixed Customer API as the project definition.
- Verification reports explain missing implementation coverage instead of only reporting file existence.
- Database metadata now drives connector selection and business-flow generation.
- Package and CLI version aligned to `0.3.0`.

### Known limitations

- Connector-specific business operations beyond the Snowflake customer reference implementation are still being expanded.
- The web UI is a local workspace preview; it does not yet replace Anypoint Studio or provide browser-based Mule runtime execution.
- A full Maven/MUnit verification requires a Mule/Maven environment, access to the required Mule repositories and valid connector dependencies/credentials.
- Snowflake duplicate protection is implemented as an application lookup; standard Snowflake tables do not provide ordinary unique indexes.
- CloudHub 2.0 deployment is currently a manually triggered DEV reference workflow and must be validated against the target organization's Anypoint permissions/configuration before use.
- QA/UAT/PROD promotion workflows are not yet generated automatically.
- The development branch is not yet the stable `1.0.0` release.

## [0.2.0]

Initial MuleForge generator foundation and project templates.
