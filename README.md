# 🚀 MuleForge

### Define once. Generate everything. Build faster with MuleSoft.

MuleForge is an open-source CLI for generating Mule 4 API project scaffolding from a declarative `muleforge.yaml` configuration.

## Install

```bash
npm install -g muleforge
```

## Quick start

```bash
muleforge init customer-api
cd customer-api
muleforge generate
muleforge validate
muleforge build
```

The generated project includes the Mule Maven project configuration, Mule artifact metadata, application properties, API folders, MUnit scaffolding and a reusable MuleForge configuration.

## Commands

| Command | Purpose |
|---|---|
| `muleforge init <name>` | Create a new project |
| `muleforge generate` | Generate project files from `muleforge.yaml` |
| `muleforge validate` | Validate generated project files |
| `muleforge build` | Run `mvn clean package` |
| `muleforge test` | Run `mvn test` |
| `muleforge clean` | Run `mvn clean` |
| `muleforge doctor` | Check Java and Maven availability |

## Configuration

Example:

```yaml
project:
  name: customer-api
  artifactId: customer-api
  groupId: com.example
  version: 1.0.0
  muleRuntime: 4.9.0

api:
  name: customer-api
  version: v1
  specification: RAML
  basePath: /api/v1

operations:
  - name: getCustomer
    method: GET
    path: /customers/{customerId}

  - name: createCustomer
    method: POST
    path: /customers

testing:
  munit: true
```

## Vision

MuleForge is intended to remove repetitive MuleSoft project setup: project metadata, Maven configuration, Mule artifact metadata, API scaffolding, tests, properties and CI/CD. Future releases can add connector-aware generation, API implementation generation, CloudHub deployment configuration and interactive project setup.

## License

Apache-2.0
