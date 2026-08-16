# 🚀 MuleForge

**Describe what you want to build. MuleForge designs and generates the MuleSoft project foundation.**

MuleForge is an open-source CLI for requirement-driven Mule 4 project generation. Instead of manually creating project metadata, RAML, Mule flows, DataWeave, MUnit scaffolding and documentation, you describe the solution and MuleForge turns the confirmed design into a structured Mule project.

> **Design first. Generate second. Document everything.**

## ✨ What MuleForge does

- 💬 Interactive requirement interview
- 🧠 Requirement-driven solution design
- 📄 RAML/API contract scaffolding
- 🔄 Mule 4 flow generation
- 🧩 DataWeave project structure
- 🔌 Connector-aware project configuration
- 🧪 MUnit test scaffolding
- 📚 Automatic project documentation
- ✅ Project validation
- 🏗️ Maven build and test commands
- ☁️ MuleSoft deployment-ready project structure

## 🚀 Installation

### Requirements

- Node.js 18 or later
- Java 17 or later for Mule 4.6+ projects
- Maven
- Anypoint Studio when you want to open and develop the generated Mule application

### Install from npm

```bash
npm install -g muleforge
```

Verify the installation:

```bash
muleforge --version
muleforge doctor
```

## ⚡ Quick start

Create a project from a requirement:

```bash
muleforge create
```

Example requirement:

```text
Create a customer API with POST /customers.
Accept name, email and mobile number.
Validate the request and store the customer in Snowflake.
Return the generated customer ID.
```

MuleForge should identify what is already known, ask only for missing decisions, present a solution design for confirmation, and then generate the project.

For a configuration-first workflow:

```bash
muleforge init customer-api
cd customer-api
muleforge generate
muleforge validate
muleforge test
muleforge build
```

## 📁 Generated project

A generated Mule application is organized like this:

```text
customer-api/
├── muleforge.yaml
├── pom.xml
├── mule-artifact.json
├── README.md
├── src/
│   ├── main/
│   │   ├── mule/
│   │   └── resources/
│   │       ├── api/
│   │       └── dw/
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

The generated `docs/` directory explains the specific application. MuleForge's own developer documentation lives in the repository `docs/` directory.

## 🛠️ CLI

| Command | Purpose |
|---|---|
| `muleforge create` | Start a requirement-driven project creation workflow |
| `muleforge init <name>` | Create a project from configuration/defaults |
| `muleforge generate` | Generate project files from `muleforge.yaml` |
| `muleforge validate` | Validate project structure and configuration |
| `muleforge test` | Run Maven tests |
| `muleforge build` | Build the Mule application |
| `muleforge clean` | Clean generated build output |
| `muleforge doctor` | Check local Java/Maven environment |
| `muleforge docs` | Generate or refresh project documentation |

## 🧩 How requirement-driven generation works

```text
User requirement
      ↓
Requirement analysis
      ↓
Ask only missing questions
      ↓
Solution design
      ↓
User confirmation
      ↓
Mule project generation
      ↓
RAML + Mule flows + DataWeave + MUnit
      ↓
Documentation
      ↓
Validation and build
```

MuleForge should not silently invent important business decisions. When information is missing, it asks the user and records confirmed decisions in the project model.

## 📚 Documentation

Start with the [MuleForge documentation](docs/README.md).

- [Installation](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [Architecture](docs/concepts/architecture.md)
- [Requirement-Driven Generation](docs/concepts/requirement-driven-generation.md)
- [Project Model](docs/concepts/project-model.md)
- [Configuration](docs/configuration/muleforge-yaml.md)
- [Connectors](docs/connectors/README.md)
- [Generation](docs/generation/README.md)
- [Deployment](docs/deployment/README.md)

## 🔐 Security

Never commit passwords, API keys, tokens or other secrets to `muleforge.yaml`, generated application properties or source control. Use environment variables and MuleSoft secure properties for sensitive configuration.

## 🧑‍💻 Development

```bash
git clone https://github.com/Narsing-s/muleforge.git
cd muleforge
npm install
npm test
```

See [development documentation](docs/development/README.md) for project structure, testing and release guidance.

## 🤝 Contributing

Issues, feature requests, documentation improvements and pull requests are welcome. See [Contributing](docs/development/contributing.md).

## 🗺️ Roadmap

- [ ] Complete adaptive requirement interview
- [ ] Production-grade requirement-to-flow generation
- [ ] Connector-specific implementation generation
- [ ] Generated MUnit scenarios from confirmed requirements
- [ ] Automatic documentation synchronization
- [ ] CloudHub and CloudHub 2.0 deployment helpers
- [ ] Public npm release
- [ ] Stable `1.0.0` release

## 📄 License

Apache-2.0
