# CLI Commands

| Command | Purpose |
|---|---|
| `muleforge create` | Start requirement-driven project creation |
| `muleforge init <name>` | Create a project from configured/default values |
| `muleforge generate` | Generate files from `muleforge.yaml` |
| `muleforge docs` | Generate or refresh project documentation |
| `muleforge validate` | Validate project structure and configuration |
| `muleforge build` | Run the Maven package build |
| `muleforge test` | Run project tests |
| `muleforge clean` | Clean build output |
| `muleforge doctor` | Check local prerequisites |
| `muleforge explain` | Explain the generated project and flows |

## Typical workflow

```bash
muleforge create
cd <project>
muleforge validate
muleforge test
muleforge build
```
