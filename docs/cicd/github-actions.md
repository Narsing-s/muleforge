# CI/CD with GitHub Actions

MuleForge can provide a GitHub Actions quality gate for generated projects.

## What CI does

The repository workflow should run on pull requests and protected branches and perform:

1. Node/CLI tests
2. MuleForge verification
3. Reference-project checks
4. Secret-hygiene checks
5. Artifact collection where useful

The generated application should not be considered deployable just because the workflow file exists. The pipeline must pass the project's actual build and tests in an environment with the required Mule Maven repositories and connector dependencies.

## Local commands

Before pushing:

```bash
npm ci
npm test
muleforge verify customer-api
```

For a Mule project with Maven configured:

```bash
mvn clean test
mvn clean package
```

## Secrets

Never put Anypoint Platform credentials, Snowflake credentials, client secrets or tokens directly in workflow files.

Use GitHub repository/environment secrets or an approved enterprise secret manager. Keep DEV, QA, UAT and PROD credentials separated.

## Deployment promotion

A recommended enterprise promotion model is:

```text
Pull Request
    ↓
CI: verify + test + package
    ↓
DEV deployment
    ↓
QA approval
    ↓
UAT approval
    ↓
PROD approval
```

Deployment workflows for CloudHub/CloudHub 2.0/Runtime Fabric should be added only after the target runtime, Mule Maven plugin version, authentication mechanism and organization governance requirements are confirmed.

## Why deployment is separate

MuleForge generates and validates the application and pipeline configuration. GitHub Actions executes CI/CD. MuleForge should not become a credential vault or replace the organization's CI/CD platform.
