# Production project artifacts

MuleForge 0.4 adds production-oriented artifacts to generated projects.

## Generated assets

`muleforge generate` now creates:

- `postman/<artifact>.collection.json` — Postman Collection v2.1
- `src/main/resources/properties/application-dev.yaml`
- `src/main/resources/properties/application-qa.yaml`
- `src/main/resources/properties/application-uat.yaml`
- `src/main/resources/properties/application-prod.yaml`
- `.github/workflows/ci-generated.yml` — verify, test and Maven package pipeline
- `.dockerignore`

No passwords, API keys or client secrets are generated. Environment property placeholders must be supplied through the deployment environment or approved secret-management mechanism.

## Commands

```bash
muleforge postman
muleforge cicd
muleforge generate
```

`postman` and `cicd` can be run independently after `muleforge init` or after editing `muleforge.yaml`.

The generated workflow intentionally stops at verification/build. Cloud deployment credentials and promotion approvals remain organization-specific.
