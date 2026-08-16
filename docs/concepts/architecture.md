# Architecture

MuleForge separates requirement understanding, project modeling, generation and documentation.

```text
User requirement
      ↓
Requirement interview
      ↓
Solution design
      ↓
User confirmation
      ↓
Project model (muleforge.yaml)
      ↓
Generator
  ├── RAML
  ├── Mule XML
  ├── DataWeave
  ├── Connector configuration
  ├── MUnit
  └── Documentation
      ↓
Validate → Test → Build → Deploy
```

## Design principles

1. The user requirement is the source of business intent.
2. MuleForge asks for missing decisions rather than silently inventing them.
3. Connectors are reusable building blocks, not fixed business flows.
4. The project model is the source used by both code and documentation generation.
5. Credentials and secrets are supplied through environment or secure properties.
6. Generated applications remain normal Mule projects that users can open, review and deploy independently of MuleForge.
