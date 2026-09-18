# Free Hosting

## Render — easiest public demo

The repository contains render.yaml and a Dockerfile.

Render can deploy Docker web services on its Free plan. Free web services spin down after 15 minutes without inbound traffic and restart on the next request. Render also uses an ephemeral filesystem on Free services.

Deployment:
1. Connect the MuleForge GitHub repository.
2. Create a Blueprint from render.yaml.
3. Wait for the Docker build.
4. Open the generated Render URL.
5. Check /health.

The hosted instance is a public web experience. It cannot write to the visitor's Desktop.

## 24/7 self-hosted option

For an always-running free infrastructure experiment, use an Always Free VM and run the supplied Docker image behind HTTPS.

Recommended server:
Internet -> HTTPS reverse proxy -> MuleForge Docker container -> /health

Keep Maven/build execution isolated from the public web process before allowing untrusted users to execute generated projects.

## Important

Do not promise "24/7 free" as a managed-hosting SLA. Free managed services can sleep, restart, exhaust quotas, or change limits. A free VM gives you more control, but you remain responsible for updates, monitoring, backups and recovery.
