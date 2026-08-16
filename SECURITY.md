# Security Policy

## Reporting a vulnerability

Please do not publish security vulnerabilities in a public issue. Report them privately to the repository maintainers so the issue can be investigated and fixed before public disclosure.

## Secrets

Never commit:

- API keys
- passwords
- OAuth tokens
- database credentials
- MuleSoft client secrets
- private certificates

Use environment variables, secure properties, or your organization's approved secret-management solution.

## Local-first behavior

MuleForge is designed so generated projects can remain on the user's machine. If an AI provider or external service is configured in the future, the documentation will clearly identify what information is sent externally and how to disable it.
