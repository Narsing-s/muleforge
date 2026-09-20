# 🚀 MuleForge

**Describe what you want to build. MuleForge designs, generates and verifies the MuleSoft project foundation.**

MuleForge is an open-source CLI for requirement-driven Mule 4 project generation. It helps MuleSoft developers reduce repetitive project setup by turning confirmed requirements into a structured project with API contracts, Mule flows, configuration, tests and documentation.

> **Design first. Generate second. Verify everything.**

## New engineering gates

- Semantic integration IR validation
- Security secret scan and dependency inventory
- CycloneDX SBOM generation
- Schema-driven MUnit response assertions
- Safe repair of missing support scaffolding

## 👥 Who is MuleForge for?

MuleForge is intended for MuleSoft developers, integration teams and API teams that want to reduce manual project scaffolding and keep requirements, implementation and documentation aligned.

## ⚡ How MuleForge works

```text
User requirement
      ↓
Requirement analysis
      ↓
Ask only missing questions
      ↓
Solution design preview
      ↓
User approval
      ↓
Generate Mule project
      ↓
RAML + Mule + DataWeave + MUnit + docs
      ↓
Verify requirement coverage
      ↓
Git / CI quality gate
      ↓
Developer review
```

MuleForge should not silently invent important business decisions. Confirmed decisions become part of the project model and drive generation and documentation.

## 🚀 Install

### Prerequisites

- Node.js 18 or later
- Java 17 or later for Mule 4.6+ projects
- Maven
- Anypoint Studio when you want to open and develop the generated application

### Install the CLI

For a published npm release:

```bash
npm install -g muleforge
```

During development, install from the repository:

```bash
git clone https://github.com/Narsing-s/muleforge.git
cd muleforge
npm install
npm link
```

Check the local environment:

```bash
muleforge --version
muleforge doctor
```

> **Current status:** the development branch is actively evolving. The public npm package and stable `1.0.0` release are roadmap items. Check the release notes before using a development version for production work.

## 🧑‍💻 Create your first project

Run:

```bash
muleforge create
```

Then describe the business requirement in normal language. For example:

```text
Create a customer API with POST /customers.
Accept name, email and mobile number.
Validate email.
Store the customer in Snowflake.
Return customerId and status.
If the customer already exists, return 409.
```

MuleForge should identify what is known, ask for missing decisions, show the proposed solution and wait for approval before generation.

## ⚙️ Configuration validation

MuleForge also validates declared configuration schemas before generation or deployment. Use:

```bash
muleforge config-check
```

When a project defines `properties` or `configuration` entries, the gate checks required values and validates declared defaults against `allowedValues`. The same configuration gate is included in `muleforge validate`.

## 🔎 Verify the result

After generation, run:

```bash
muleforge verify
```

The verification quality gate checks the generated project against the confirmed requirement, including project metadata, API operations, generated RAML, Mule implementation, operation coverage, MUnit scaffolding and other structural requirements.

For verification followed by Maven tests:

```bash
muleforge verify --build
```

A successful result should look like:

```text
MuleForge Verification

Requirement coverage     100%
API validation           PASS
Mule implementation      PASS
MUnit                    PASS
Maven build              PASS

RESULT: READY FOR DEVELOPER REVIEW
```

A passing static verification is **not** a substitute for reviewing business behavior, credentials, environments or deployment configuration.

## 🔁 CI/CD with GitHub Actions

MuleForge includes a GitHub Actions CI quality gate in the development branch at `.github/workflows/ci.yml`.

The workflow runs on pull requests and protected branches and checks:

```text
CLI tests
   ↓
MuleForge verification
   ↓
Reference-project checks
   ↓
Secret-hygiene checks
```

A generated repository can use the same model to prevent changes from being merged when tests or MuleForge verification fail.

CI is intentionally separate from deployment. GitHub Actions executes the pipeline; MuleForge supplies the project model, verification and pipeline templates. Credentials must be stored in GitHub Secrets/environments or an approved enterprise secret manager.

Recommended promotion model:

```text
Pull Request
    ↓
CI: verify + test + package
    ↓
DEV
    ↓
QA approval
    ↓
UAT approval
    ↓
PROD approval
```

See [CI/CD documentation](docs/cicd/README.md), [GitHub Actions guidance](docs/cicd/github-actions.md), and [runtime validation](docs/cicd/runtime-validation.md).

> Deployment helpers are generated for CloudHub 1.0, CloudHub 2.0, Runtime Fabric and on-premises Runtime Manager. They are target-aware templates and require organization-specific Anypoint permissions plus secure Maven settings. Do not put Anypoint credentials directly into generated workflow files.

## 💾 Local Desktop export workflow

The local Web UI now keeps generated output in a temporary staging directory until the complete generation workflow passes. The **Verify Workflow & Save to Desktop** action runs static requirement verification, Maven tests and a Maven package gate first. Only after every gate succeeds is the complete generated project copied to the user's existing `Desktop` folder. If any gate fails, nothing is copied or overwritten.

This is intentionally local: no generated project is uploaded to a remote service and no Anypoint credentials are required for the export workflow. The browser UI cannot directly write arbitrary desktop paths, so the local MuleForge Node server performs the final filesystem copy.

## 🛠️ CLI commands

| Command | Purpose |
|---|---|
| `muleforge create` | Start requirement-driven project creation |
| `muleforge init <name>` | Initialize a project/configuration |
| `muleforge generate` | Generate files from `muleforge.yaml` |
| `muleforge validate` | Run verification, contract, deployment, policy, connector and quality gates |
| `muleforge breaking-check <old.yaml> [new.yaml]` | Detect potentially breaking API contract changes |
| `muleforge contract-diff <old.yaml> [new.yaml]` | Show semantic API contract changes without failing the command |
| `muleforge verify` | Check requirement-to-project coverage |
| `muleforge verify --build` | Verify and run Maven tests when static checks pass |
| `muleforge test` | Run Maven tests |
| `muleforge build` | Build the Mule application |
| `muleforge clean` | Clean Maven output |
| `muleforge doctor` | Check local development tools |
| `muleforge runtime-check` | Check Java, Maven and Mule project prerequisites |
| `muleforge release-check` | Check release-readiness and required quality artifacts |
| `muleforge deployment-check [config]` | Validate deployment target and release settings |
| `muleforge policy-check [config]` | Validate retry, pagination, idempotency, transaction and security policies |
| `muleforge connector-check [config]` | Verify connector dependencies, namespaces, configs and generated operations |
| `muleforge sync-docs [config]` | Synchronize application documentation and traceability |
| `muleforge openapi [config]` | Generate an OpenAPI 3.x contract from the project model |
| `muleforge runtime-test [directory] --start` | Run Maven tests and optionally start Mule and probe a readiness endpoint |
| `muleforge trace [config]` | Generate requirement-to-asset traceability with source references |
| `muleforge postman [config]` | Generate a Postman collection with documented response assertions |
| `muleforge cicd [config]` | Generate CI/CD environment and workflow assets |
| `muleforge promotion-plan [config]` | Generate environment promotion and rollback metadata |
| `muleforge config-check [config]` | Validate required, typed and allowed configuration values |
| `muleforge governance-check [config]` | Validate API governance conventions, operation uniqueness, schemas, statuses, security and error contracts |
| `muleforge compatibility-check [config] [directory]` | Validate declared Java/Mule runtime compatibility and generated Maven alignment |
| `muleforge environment-diff <from> <to>` | Compare environment models while redacting sensitive values |
| `muleforge contract-check [config]` | Validate API operation contracts before generation |
| `muleforge event-check [config]` | Validate event and messaging trigger definitions |
| `muleforge ir-check [config]` | Validate the semantic integration model |
| `muleforge security-scan [directory]` | Scan source for secrets and dependency inventory |
| `muleforge sbom [directory]` | Generate a CycloneDX dependency SBOM |
| `muleforge dependency-audit [directory]` | Run available dependency vulnerability audits |
| `muleforge dataweave-check [directory]` | Validate generated DataWeave scripts |
| `muleforge dataweave-validate <file>` | Validate one DataWeave script |
| `muleforge dataweave-run <file>` | Execute DataWeave only when the official runtime CLI is installed |
| `muleforge golden-test [directory]` | Run golden generation regression fixtures |
| `muleforge import [directory]` | Reverse-engineer an existing Mule project into a reviewable model |
| `muleforge reconcile [config] [directory]` | Reconcile confirmed requirements against an existing Mule repository without overwriting or duplicating source assets |
| `muleforge readiness [config] [directory]` | Aggregate existing engineering gates into one lifecycle readiness report without replacing them |\n| `muleforge plan [config]` | Classify the workload and produce the single end-to-end developer engineering plan |\n| `muleforge explain [directory]` | Explain an existing Mule project using imported semantic evidence without modifying source |
| `muleforge artifact-manifest [directory]` | Generate a SHA-256 artifact provenance manifest |
| `muleforge artifact-keygen [directory]` | Generate an Ed25519 signing key pair |
| `muleforge artifact-sign [directory]` | Sign an artifact manifest |
| `muleforge artifact-verify [directory]` | Verify an artifact manifest signature |
| `muleforge db-migration <from> <to> [directory]` | Generate reviewable SQL for JSON schema drift |
| `muleforge ci-native <target> [directory]` | Generate a native GitLab, Azure DevOps, Jenkins or Bitbucket CI template |
| `muleforge ide-manifest [directory]` | Generate IDE integration metadata |
| `muleforge soap-scaffold [config]` | Generate a reviewable SOAP/WSDL scaffold when configured |
| `muleforge graphql [config]` | Generate a GraphQL schema scaffold |


Run:

```bash
muleforge --help
```

for the command options available in your installed version.

## 📁 Generated project

A generated Mule application is organized around the confirmed project model:

```text
customer-api/
├── muleforge.yaml
├── pom.xml
├── mule-artifact.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── main/
│   │   ├── mule/
│   │   └── resources/
│   │       ├── api/
│   │       └── properties/
│   └── test/
│       └── munit/
└── docs/
    ├── 00-solution-design/
    ├── 01-requirements/
    ├── 02-architecture/
    ├── 03-api/
    ├── 04-database/
    ├── 05-dataweave/
    ├── 06-flows/
    ├── 07-configuration/
    ├── 08-testing/
    ├── 09-deployment/
    ├── 10-troubleshooting/
    └── 11-traceability.md
```

The generated `docs/` folder describes the specific application. The MuleForge repository `docs/` folder describes how to use and develop MuleForge itself.

## 📦 Document package or repository intake

MuleForge can start from either a single requirement document or a directory containing the project documentation package. The existing analyzer is reused as the single source of truth; MuleForge does not create a second requirements model.

Examples:

    muleforge analyze requirements/customer-requirement.pdf customer-api
    muleforge analyze ./requirements customer-api

Directory intake supports common requirement and integration artifacts including PDF, DOCX, PPTX, XLSX, Markdown, text, CSV, JSON, YAML, HTML, RAML, XML, DataWeave, SQL and properties files. Generated/build directories are ignored, and muleforge.yaml remains the canonical project model rather than being re-imported as duplicate input.

The resulting model drives the same downstream lifecycle:

    documentation → requirements/evidence → API design → Mule implementation → DataWeave → MUnit → Postman → verification → CI/CD → deployment artifacts → promotion/rollback metadata

MuleSoft documents the same design-before-implementation lifecycle: define the API contract, implement and test the integration, then deploy and verify it. citeturn0search0turn0search2turn0search5
## 🧭 Workload-neutral engineering

MuleForge is not limited to customer-facing REST APIs. The same evidence/model pipeline can classify and engineer API, event-driven, scheduled, file/SFTP, batch, SOAP, GraphQL, general integration and unknown Mule workloads.

The input paths converge:

    requirement documents
          OR
    existing Mule repository
          ↓
    existing evidence extraction
          ↓
    canonical MuleForge model
          ↓
    workload classification
          ↓
    architecture/design
          ↓
    implementation → transformation → reliability → MUnit
          ↓
    quality → traceability → package
          ↓
    deployment preflight → deployment → runtime verification

RAML/OpenAPI is generated when the workload actually requires an API contract. Non-API integrations are not forced through an artificial RAML/Postman path.

For an existing project:

    muleforge explain ./existing-mule-project
    muleforge plan muleforge.yaml
    muleforge explain ./existing-mule-project --operation POST:/customers

Operation explain mode traces a reconstructed operation back to its source file and reports available flow, connector, transformation, error-handling, contract and MUnit evidence. Missing evidence is returned with remediation fields rather than being invented.

The local UI also has **Existing MuleSoft repository** mode. A complete repository folder can be selected for read-only reverse engineering; MuleForge copies it to a temporary workspace, reconstructs its semantics and workload, and never edits the supplied source during analysis.

MuleForge reports confirmed/inferred/unknown decisions and preserves developer-owned and external assets during regeneration. The existing importer, semantic IR, traceability and verification engines remain the source of engineering evidence; this workload layer does not duplicate them.

## 🔄 Existing repository reconciliation

MuleForge can use an existing Mule repository as an engineering input, not only as a generation target. Use `muleforge import` to inventory the existing project, then `muleforge reconcile` to compare a confirmed `muleforge.yaml` against that repository.

Example:

    muleforge reconcile muleforge.yaml ./existing-mule-project

The reconciliation report identifies implemented operations, missing operations, connector drift and extra existing operations. It writes references and findings to `muleforge-reconciliation.json` and `docs/12-reconciliation.md` without copying or regenerating the existing source assets.

This keeps the repository path and the documentation-upload path on the same canonical project model:

    documentation/repository evidence
             ↓
       confirmed model
             ↓
    design → implementation → test → CI/CD → deployment → runtime verification
             ↓
       reconciliation when an existing implementation is supplied

Existing repository credentials, environment values and organization-specific deployment permissions remain external inputs. MuleForge can generate and validate the deployment automation, but it must not invent or store those secrets.

## 🧩 Current capabilities

- Interactive requirement workflow
- Requirement model and missing-information detection
- Solution design preview before generation
- RAML scaffolding
- Mule 4 project generation
- Connector-aware Maven dependencies/configuration
- MUnit scaffolding
- Automatic generated-project documentation
- Detailed RAML request/response schema generation
- Nested object and array-of-object field extraction from requirement documents
- Persistent idempotency reservation and transaction-aware generation
- Runtime database/Snowflake pagination response metadata
- Connector-aware MUnit test scaffolding with documented matcher syntax
- Requirement/project verification
- Maven build and test integration
- Local development environment diagnostics
- GitHub Actions CI quality gate
- Secret-hygiene checks in CI
- OpenAPI 3.x contract generation from the project model
- APIKit router and operation implementation scaffolding
- Maven + optional live Mule readiness runtime verification
- Semantic API contract diff and deeper breaking-change detection
- API governance validation
- Java/Mule runtime compatibility checks
- Secret-safe environment configuration diffing

## ⚠️ Current limitations

MuleForge is still under active development. In particular:

- Connector-specific business implementations are being expanded.
- Some generated business logic still requires developer review for organization-specific semantics.
- Full runtime validation requires a Mule/Maven environment and, where applicable, real connector credentials.
- API Manager policy enforcement and enterprise secret-management integration remain deployment-specific rather than being fabricated into generated application code.
- The development branch is not a guarantee of production readiness.

Do not deploy generated applications to production solely because `muleforge verify` passes.

## 📚 Documentation

Start here:

- [Documentation home](docs/README.md)
- [Installation](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [Architecture](docs/concepts/architecture.md)
- [Requirement-Driven Generation](docs/concepts/requirement-driven-generation.md)
- [Project Model](docs/concepts/project-model.md)
- [Configuration](docs/configuration/muleforge-yaml.md)
- [Generation](docs/generation/README.md)
- [Connectors](docs/connectors/README.md)
- [CI/CD](docs/cicd/README.md)
- [GitHub Actions](docs/cicd/github-actions.md)
- [Deployment](docs/deployment/README.md)
- [Troubleshooting](docs/troubleshooting/README.md)

## 🔄 What changed recently?

See [CHANGELOG.md](CHANGELOG.md) for feature-by-feature changes, known limitations and release notes.

Every user-visible feature should update the relevant README/docs and changelog so the documentation remains synchronized with the implementation.

## 🔐 Security

Never commit passwords, API keys, tokens, database credentials or MuleSoft client secrets. Use environment variables, MuleSoft secure properties or your organization's approved secret-management solution.

See [SECURITY.md](SECURITY.md).

## ☁️ Where does MuleForge run?

MuleForge is a CLI and can run locally on the developer's machine. It generates a Mule application; it is **not itself a Mule application that needs to be deployed to CloudHub**.

The generated application can then be opened in Anypoint Studio and deployed through the organization's normal MuleSoft process, such as CloudHub, CloudHub 2.0, Runtime Fabric or an on-premises runtime.

```text
Developer machine
      ↓
MuleForge CLI / Web UI
      ↓
Generated Mule application
      ↓
Git / CI/CD
      ↓
CloudHub / CloudHub 2.0 / Runtime Fabric / on-prem
```

## 🤝 Contributing

Issues, feature requests, documentation improvements and pull requests are welcome.

When adding a feature, update the implementation, tests and user documentation together.

## 🗺️ Roadmap

- [x] GitHub Actions CI quality gate
- [x] Manual generated-project Maven/MUnit runtime validation
- [x] CLI verification
- [x] Local Web UI
- [ ] Production-grade requirement-to-flow generation
- [x] OpenAPI contract generation
- [x] APIKit router generation
- [x] Runtime verification command
- [x] Semantic breaking-change detection
- [x] Connector-specific implementation generation
- [x] Requirement-derived MUnit scenarios
- [x] Complete requirement-to-code traceability
- [x] Automatic documentation synchronization
- [ ] `muleforge cicd init`
- [x] CloudHub and CloudHub 2.0 deployment helpers
- [x] Runtime Fabric deployment helpers
- [x] Deployment target validation and release safety checks
- [x] On-premises Runtime Manager deployment helper
- [ ] Public npm release
- [ ] Stable `1.0.0` release

## 📄 License

Apache-2.0


## Document-first requirement fidelity

MuleForge treats the complete requirement package as the source of truth for solution generation.

- Upload multiple requirement documents together: PDF, DOCX, PPTX, XLSX, TXT, Markdown, CSV, JSON, YAML or HTML.
- Explicit API and integration connectivity is preserved: REST/HTTP endpoints, SFTP hosts/paths, IBM MQ queues, Anypoint MQ destinations, database/Snowflake references, schedules and authentication schemes.
- Missing connection values are surfaced as required configuration/placeholders; MuleForge does not invent credentials or secret values.
- Conflicting documents are detected and shown with their source documents. Desktop export is blocked until conflicts are resolved.
- The UI exposes source documents, extracted requirements, explicit connectivity, missing configuration and requirement traceability.
- Local Desktop export remains fail-closed: staging, verification, Maven tests and package must pass before the generated project is copied to Desktop.

PDF extraction uses `pdftotext` when available; DOCX/PPTX/XLSX extraction uses the system `unzip` or `tar` utility. If the required extractor is unavailable, MuleForge reports that instead of pretending the document was analyzed.


## 🧭 Developer engineering evidence

Existing-repository analysis now extends the same semantic model with:

- change-impact evidence across contract, Mule implementation, DataWeave, MUnit, traceability, CI/CD and deployment;
- operation coverage showing confirmed, missing, unknown and not-applicable evidence instead of assuming every project is an API;
- Maven dependency and `exchange.json` dependency evidence when present, preserving external asset identity/version without copying or mutating it;
- an explicit deployment/runtime boundary that distinguishes **DEPLOYED** from **RUNTIME-VERIFIED**;
- lifecycle-aware developer handoff so modernization and regeneration remain review-first and ownership-safe.

Exchange dependencies can represent RAML/OAS fragments, JSON schemas and rulesets, so MuleForge records their identity/version evidence rather than silently duplicating external assets. citeturn0search0turn0search2

## 🔍 Quality and traceability

Generated projects now include a machine-readable `muleforge-traceability.json` manifest and `docs/11-traceability.md`. Run `muleforge trace` to regenerate them and `muleforge validate` or `muleforge self-test` before release; `muleforge audit` to check requirement completeness, duplicate operations, generated assets and obvious hard-coded secrets.

These additions are additive: the existing generation, verification, Maven and Desktop-save workflow remains unchanged.
