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
