## 0.9.17

- Added generated API Manager rate-limiting policy manifests for operations declaring rate limits.
- Added per-operation HTTP method/path pointcuts and millisecond quota conversion for rate-limit deployment configuration.
- Extended quality auditing to verify rate-limit manifest completeness and values.
- Added regression coverage for generated rate-limit policy artifacts.
- Synchronized package, lockfile and CLI versions.

## 0.9.16

- Added generated retry execution using until-successful policy configuration.
- Added HTTP downstream response timeout generation when an operation declares timeout.
- Extended generated artifact auditing to verify HTTP timeout evidence.
- Added regression coverage for retry and timeout generation.

## 0.9.15

- Made policy generation audits operation-specific to reduce false positives across unrelated flows.
- Hardened generated application CI with explicit Maven settings validation and MUnit/Surefire/coverage artifacts.
- Strengthened release readiness with workflow YAML parsing and package/CLI/changelog version synchronization.

## 0.9.12

- Hardened contract validation for request/response field schemas and declared error statuses.
- Added deployment application-name/version validation.
- Added regression coverage for invalid schema contracts.

## 0.9.11

- Hardened breaking-change detection by separating request and response compatibility checks.
- Added detection for field type changes and path-parameter changes.
- Removed duplicate generated pagination response transforms.
- Corrected connector-failure MUnit expectations to match generated HTTP 503 dependency handling.
- Strengthened contract validation for request/response schemas, declared error statuses, rate limits and timeouts.
- Corrected generated MUnit connector failure mocks to use module-specific Mule error types.


## 0.9.8

- Added persistent Object Store idempotency reservations for idempotent generated operations.
- Added duplicate-idempotency handling with HTTP 409 response scaffolding.
- Added real Mule transaction boundaries for transaction-enabled generated business and connector flows.
- Added runtime database/Snowflake pagination parameters, total-count metadata and has-next response metadata.
- Added generated MUnit scenarios for idempotency duplicates and pagination.
- Added connector failure mocks using MUnit error responses.

## 0.9.7

- Added detailed RAML request/response field schema generation from requirement fields.
- Added Basic Authentication contract support to generated RAML security bindings.
- Corrected generated MUnit matcher syntax to use the documented MunitTools expressions.
- Corrected generated MUnit connector mocks to use the documented then-return payload structure.
- Strengthened release readiness so package-lock root metadata must exactly match package.json.

## 0.9.6

- Added operation policy validation for retries, pagination, idempotency, transactions and security.
- Added RAML contract generation for security, pagination, idempotency and documented error responses.
- Added generated-flow policy hooks for idempotency, pagination and transaction review boundaries.
- Added a gated release packaging workflow and expanded release-readiness checks.

## 0.9.5

- Added operation-derived MUnit scenario planning and connector-error coverage.
- Enabled Surefire reporting in generated MUnit projects.

## 0.9.4

- Added connector integrity auditing across Maven dependencies, XML namespaces, connector configurations and generated operations.
- Added `muleforge connector-check`.
- Added `muleforge sync-docs` for documentation and traceability synchronization.
- Fixed generated native configurations and Snowflake namespace/schema support for connector-aware flows.

## 0.9.3

- Added on-premises Runtime Manager (`armDeployment`) Maven profile and workflow.
- Added on-premises deployment regression coverage.

## 0.9.2

- Added CloudHub 1.0 and Runtime Fabric Maven deployment profiles.
- Added target-aware deployment workflows and deployment matrix.
- Added deployment target validation and release-version safety checks.

## Unreleased

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

# 0.7.0

- Added machine-readable requirement-to-asset traceability.
- Added generated `docs/11-traceability.md`.
- Added `muleforge audit` quality/security hygiene gate.
- Added `muleforge trace` command.
- Verification now requires traceability assets for generated projects.

# Changelog

## 0.9.14

- Added policy-aware MUnit scenarios for retry exhaustion and transaction rollback.
- Made generated error scenarios aware of declared API error statuses while preserving baseline coverage when no statuses are declared.


## 0.9.13

- Added generated operation coverage checks for RAML, Mule flows and MUnit happy-path suites.
- Added static evidence checks for configured retry, pagination, idempotency and transaction policies.
- Added dynamic HTTP port configuration to generated MUnit Maven builds for CI reliability.
- Hardened manual Maven/MUnit runtime validation with settings preflight and quieter Maven logs.


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
