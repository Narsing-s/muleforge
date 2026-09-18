## 0.9.3\n\n- Added on-premises Runtime Manager (`armDeployment`) Maven profile and workflow.\n- Added on-premises deployment regression coverage.\n\n## 0.9.2\n\n- Added CloudHub 1.0 and Runtime Fabric Maven deployment profiles.\n- Added target-aware deployment workflows and deployment matrix.\n- Added deployment target validation and release-version safety checks.\n\n## Unreleased

- Added a manual GitHub Actions runtime-validation workflow that generates the reference Mule project and can execute Maven/MUnit tests and packaging with an approved `MAVEN_SETTINGS_XML` secret.
- Added runtime validation documentation and report/JAR artifact collection.
- Extended `muleforge release-check` to require the runtime validation workflow and documentation.
- Added regression coverage for the new release-readiness requirements.

# 0.9.1

- Updated generated MUnit configuration to use the current `munit.runtimeversion` property.
- Made generated MUnit scenarios connector-aware by mocking external connector processors.
- Limited the generated customer not-found test to the Snowflake customer flow that actually implements 404 behavior.
- Unified `muleforge validate` so it runs verification, contract validation and the quality audit together.
- Documented `muleforge runtime-check` and the expanded validation gate.

# 0.9.0

- Added a local `muleforge self-test` smoke gate covering generation, contract validation, verification and audit.
- Fixed duplicate Database connector configuration in generated Mule XML.
- Fixed generated application CI so it no longer assumes the MuleForge CLI is installed in the generated project.
- Strengthened API contract validation for operation names, HTTP methods, paths and success status codes.
- Expanded traceability with generated asset paths and on-disk evidence.
- Expanded the quality audit to cover traceability evidence, Postman assets and environment property files.

# 0.8.0

- Expanded enterprise connector catalog and generated flow support.
- Added existing-project inspection via `muleforge inspect-project`.
- Deepened quality/security audit checks.
- Added enhancement tests.

# 0.7.0\n\n- Added machine-readable requirement-to-asset traceability.\n- Added generated `docs/11-traceability.md`.\n- Added `muleforge audit` quality/security hygiene gate.\n- Added `muleforge trace` command.\n- Verification now requires traceability assets for generated projects.\n\n# Changelog

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
