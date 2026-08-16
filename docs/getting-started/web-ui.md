# MuleForge Web Workspace

MuleForge includes a local web workspace for a simpler developer experience. The web workspace uses the same repository and generation model as the CLI; it is not a separate Mule generator.

## Start it

From a MuleForge checkout:

```bash
npm install
npm link
muleforge ui
```

Open:

```text
http://127.0.0.1:4173
```

To use another local port:

```bash
muleforge ui --port 5000
```

## What the UI provides

- Requirement entry
- Solution design preview
- Visual flow overview
- API/RAML preview
- MUnit scenario overview
- Verification dashboard
- Generated-documentation navigation

## Important

The current UI is a local workspace preview. It does not yet replace Anypoint Studio, execute arbitrary Mule applications in the browser, or deploy credentials by itself. Generation and verification remain CLI/core capabilities.

The intended architecture is:

```text
                 MuleForge Core
                  /          \
                CLI          Web UI
                 \            /
                  Project Model
                       ↓
              Generator / Validator
```

Future releases can add real-time project APIs, file editing, Git integration, CI/CD and deployment controls without creating a second generation engine.
