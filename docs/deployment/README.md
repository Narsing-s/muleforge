# Deployment

MuleForge itself is a Node.js CLI. Users install it on their development machine; the generated Mule application is what gets deployed.

```text
GitHub → source and documentation
   ↓
npm → MuleForge CLI distribution
   ↓
Developer machine → project generation
   ↓
Generated Mule application
   ↓
CloudHub / CloudHub 2.0 / Runtime Fabric / on-premises
```

## Important distinction

Do not deploy the MuleForge CLI to CloudHub just to make it available to users. Publish the CLI through npm and keep its source, releases and documentation in GitHub.

## Generated application

After generation, users can open the Mule project in Anypoint Studio, run local validation/tests, build with Maven and deploy the resulting application using their organization's MuleSoft deployment process.

Environment-specific credentials and deployment settings must be supplied securely and should not be committed to the generated repository.


## Deployment helpers

Generated projects can opt into one target with `deployment.target`:

- `cloudhub` — CloudHub 1.0 via `cloudHubDeployment`
- `cloudhub2` — CloudHub 2.0 via `cloudhub2Deployment`
- `rtf` — Runtime Fabric via `runtimeFabricDeployment`
- `onprem` — Runtime Manager REST deployment via `armDeployment`

MuleForge generates target-aware GitHub Actions workflows and Maven profiles. The enabled workflow still requires your organization's Anypoint permissions, environment/target values and secure Maven `settings.xml`. MuleSoft documents Maven deployment for CloudHub, CloudHub 2.0, Runtime Fabric and on-premises Runtime Manager strategies.