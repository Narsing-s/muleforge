# 🚀 MuleForge

### Define once. Generate everything. Build faster with MuleSoft.

MuleForge is an open-source CLI for generating Mule 4 API projects without manually creating the standard project structure, Maven metadata, RAML, Mule flows and test scaffolding.

## Install

```bash
npm install -g muleforge
```

## Interactive quick start

Run:

```bash
muleforge init
```

MuleForge will ask for:

- Project name
- API type: System, Process or Experience API
- Mule runtime
- Java version
- Database
- Connectors
- MUnit testing
- Deployment target

It then creates the project and generates the initial Mule application automatically.

## Non-interactive quick start

```bash
muleforge init customer-api
cd customer-api
muleforge validate
muleforge build
```

## Commands

| Command | Purpose |
|---|---|
| `muleforge init` | Interactive project creation |
| `muleforge init <name>` | Create a project with defaults |
| `muleforge generate` | Generate files from `muleforge.yaml` |
| `muleforge validate` | Validate generated project files |
| `muleforge build` | Run `mvn clean package` |
| `muleforge test` | Run `mvn test` |
| `muleforge clean` | Run `mvn clean` |
| `muleforge doctor` | Check Node, Java, Maven and Git |

## Generated structure

```text
customer-api/
├── muleforge.yaml
├── pom.xml
├── mule-artifact.json
├── README.md
└── src/
    ├── main/
    │   ├── mule/
    │   │   └── customer-api.xml
    │   └── resources/
    │       ├── application.yaml
    │       └── api/
    │           └── customer-api.raml
    └── test/
        └── munit/
            └── customer-api-test.xml
```

## Configuration

MuleForge keeps project choices in `muleforge.yaml`, so the project can be regenerated consistently.

```yaml
project:
  name: customer-api
  artifactId: customer-api
  groupId: com.example
  version: 1.0.0
  muleRuntime: 4.9.0
  java: "17"

api:
  name: customer-api
  version: v1
  type: System API
  specification: RAML
  basePath: /api/v1

operations:
  - name: getCustomer
    method: GET
    path: /customers/{customerId}

  - name: createCustomer
    method: POST
    path: /customers

database:
  type: none

connectors:
  - http

testing:
  munit: true

deployment:
  target: none
```

## Important

MuleForge generates the project structure and starter implementation. Connector-specific Maven dependencies, credentials, CloudHub deployment settings and production business logic should be configured according to the target MuleSoft environment before deployment.

## Roadmap

- Connector-aware Maven dependency generation
- Snowflake/Database/IBM MQ/SFTP/Anypoint MQ/Object Store templates
- API-led implementation templates
- DataWeave templates
- CloudHub and CloudHub 2.0 deployment configuration
- Better RAML/OAS generation
- MUnit test generation from operations
- npm public release automation

## License

Apache-2.0
