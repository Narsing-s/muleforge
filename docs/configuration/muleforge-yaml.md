# muleforge.yaml

`muleforge.yaml` stores the confirmed project model and allows generation to be repeated consistently.

## Core sections

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

testing:
  munit: true

deployment:
  target: none
```

Business operations should be added from the confirmed requirement rather than copied from generic examples.

## Regeneration

After editing the model:

```bash
muleforge generate
muleforge validate
```

Keep the model under version control so changes to generated code can be reviewed alongside the design change.
