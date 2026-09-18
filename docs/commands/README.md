# CLI Commands

| Command | Purpose |
|---|---|
| `muleforge create` | Start requirement-driven project creation |
| `muleforge init <name>` | Create a project from configured/default values |
| `muleforge generate` | Generate files from `muleforge.yaml` |
| `muleforge docs` | Generate or refresh project documentation |
| `muleforge validate` | Run verification, contract and quality-audit gates together |
| `muleforge build` | Run the Maven package build |
| `muleforge test` | Run project tests |
| `muleforge clean` | Clean build output |
| `muleforge doctor` | Check local development tools |
| `muleforge runtime-check` | Check Java, Maven and Mule project prerequisites without modifying the project |
| `muleforge self-test` | Run local generation + contract + verification + audit smoke gates |
| `muleforge explain` | Explain the generated project and flows |

## Typical workflow

```bash
muleforge create
cd <project>
muleforge validate
muleforge test
muleforge build
```
