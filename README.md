# 🚀 MuleForge

**Describe what you want to build. MuleForge designs, generates and verifies the MuleSoft project foundation.**

MuleForge is an open-source CLI for requirement-driven Mule 4 project generation. It helps MuleSoft developers reduce repetitive project setup by turning confirmed requirements into a structured project with API contracts, Mule flows, configuration, tests and documentation.

> **Design first. Generate second. Verify everything.**

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
API validation            PASS
Mule implementation      PASS
MUnit                    PASS
Maven build              PASS

RESULT: READY FOR DEVELOPER REVIEW
```

A passing static verification is **not** a substitute for reviewing business behavior, credentials, environments or deployment configuration.

## 🛠️ CLI commands

| Command | Purpose |
|---|---|
| `muleforge create` | Start requirement-driven project creation |
| `muleforge init <name>` | Initialize a project/configuration |
| `muleforge generate` | Generate files from `muleforge.yaml` |
| `muleforge validate` | Validate generated project quality |
| `muleforge verify` | Check requirement-to-project coverage |
| `muleforge verify --build` | Verify and run Maven tests when static checks pass |
| `muleforge test` | Run Maven tests |
| `muleforge build` | Build the Mule application |
| `muleforge clean` | Clean Maven output |
| `muleforge doctor` | Check local development tools |

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
    └── 10-troubleshooting/
```

The generated `docs/` folder describes the specific application. The MuleForge repository `docs/` folder describes how to use and develop MuleForge itself.

## 🧩 Current capabilities

- Interactive requirement workflow
- Requirement model and missing-information detection
- Solution design preview before generation
- RAML scaffolding
- Mule 4 project generation
- Connector-aware Maven dependencies/configuration
- MUnit scaffolding
- Automatic generated-project documentation
- Requirement/project verification
- Maven build and test integration
- Local development environment diagnostics

## ⚠️ Current limitations

MuleForge is still under active development. In particular:

- Connector-specific business implementations are being expanded.
- Some generated flows still require developer review and refinement.
- Full runtime validation requires a suitable Mule/Maven environment and, where applicable, real connector credentials.
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
MuleForge CLI
      ↓
Generated Mule application
      ↓
Anypoint Studio / CI/CD
      ↓
CloudHub / CloudHub 2.0 / Runtime Fabric / on-prem
```

## 🤝 Contributing

Issues, feature requests, documentation improvements and pull requests are welcome.

When adding a feature, update the implementation, tests and user documentation together.

## 🗺️ Roadmap

- [ ] Production-grade requirement-to-flow generation
- [ ] Connector-specific implementation generation
- [ ] Requirement-derived MUnit scenarios
- [ ] Complete requirement-to-code traceability
- [ ] Automatic documentation synchronization
- [ ] CloudHub and CloudHub 2.0 deployment helpers
- [ ] Public npm release
- [ ] Stable `1.0.0` release

## 📄 License

Apache-2.0
