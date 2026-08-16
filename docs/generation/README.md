# Generation

Generation converts the confirmed project model into a normal Mule 4 application.

## Generated areas

- API contract and API resources
- Mule XML flows and global configuration
- DataWeave transformations
- Connector dependencies and configuration placeholders
- MUnit test scaffolding
- Environment/property templates
- Project-specific documentation

## Guiding rule

A connector template may provide reusable technical building blocks, but the user's confirmed requirement determines the business flow. MuleForge should not generate unrelated example operations merely because a connector was selected.
