# CloudHub 2.0 DEV Deployment

The repository contains a manual GitHub Actions workflow at `.github/workflows/deploy-dev.yml`.

## GitHub Environment

Create an Environment named `development` and add these secrets:

- `ANYPOINT_CLIENT_ID`
- `ANYPOINT_CLIENT_SECRET`
- `ANYPOINT_ORG_ID`
- `ANYPOINT_ENV_ID`

Do not commit these values.

## Run deployment

Open GitHub Actions, select **Deploy Mule Application to CloudHub 2.0 - DEV**, click **Run workflow**, and choose:

- region
- application name
- Mule runtime
- worker count
- worker size
- whether to run MuleForge verification
- whether to run MUnit

The workflow verifies the required credentials, optionally verifies/tests the project, then invokes the Mule Maven deployment lifecycle with `-DmuleDeploy`.

## Important compatibility note

The exact Mule Maven Plugin CloudHub 2.0 property names and runtime/deployment configuration depend on the project's `pom.xml`, Mule Maven Plugin version and Anypoint organization/runtime setup. Before enabling this workflow for production use, run it against a dedicated DEV application and confirm the plugin configuration and Connected App permissions in that organization.

A successful workflow run is the source of truth; a workflow file existing in GitHub is not proof that an Anypoint deployment is configured correctly.

## Security

Use GitHub Environment secrets and environment protection rules. Do not place client secrets in workflow inputs, `muleforge.yaml`, source code or generated documentation.
