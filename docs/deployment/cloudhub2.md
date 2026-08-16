# CloudHub 2.0 deployment

The `customer-api` reference project now contains a guarded GitHub Actions workflow for **manual DEV deployment** to CloudHub 2.0.

## Files

```text
customer-api/
├── pom.xml
└── .github/
    └── workflows/
        └── deploy-dev.yml
```

## Required GitHub configuration

Create a GitHub Environment named `development` and add these environment secrets:

- `ANYPOINT_CLIENT_ID`
- `ANYPOINT_CLIENT_SECRET`

Use an Anypoint Platform Connected App authorized for the target organization/business group and environment. Do not commit these values to the repository.

## Before deploying

Confirm these values for your Anypoint organization:

- Environment name
- CloudHub 2.0 target name
- CloudHub 2.0 region
- Application name
- Mule runtime version
- Worker size/count

The reference project defaults are examples and must be changed for the user's organization. The workflow exposes environment, target, region and application name as manual inputs.

## Run the deployment

Open GitHub → Actions → **Deploy Customer API to CloudHub 2.0 - DEV** → Run workflow.

The workflow performs:

```text
Checkout
  ↓
Java 17
  ↓
Verify secrets
  ↓
Maven clean package
  ↓
Mule Maven deployment
```

## Security model

Deployment is intentionally manual for DEV. Production deployment must use protected GitHub Environments with required reviewers and separate credentials.

Never place client secrets, passwords, Snowflake credentials or tokens in `pom.xml`, YAML workflow files or application source.

## Important validation

CloudHub 2.0 deployment is organization-specific. The first run must be validated against the organization's Anypoint permissions, Connected App authorization, target name, region, runtime, Maven repositories and network requirements.

A successful Maven command does not replace checking the application status and health in Anypoint Runtime Manager.

## Promotion model

After DEV is proven, extend the same pattern to:

```text
DEV → QA → UAT → PROD
```

with separate GitHub Environments, secrets and approval rules.
