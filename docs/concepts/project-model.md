# Project Model

`muleforge.yaml` is the durable representation of the confirmed project design.

It should contain the project identity, runtime, API metadata, operations, connectors, validation/testing requirements and deployment target.

Example:

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

connectors:
  - http
  - snowflake

testing:
  munit: true

deployment:
  target: none
```

The project model should be stable enough to regenerate code and documentation without requiring the user to repeat the interview.
