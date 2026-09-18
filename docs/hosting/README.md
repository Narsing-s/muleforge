# MuleForge Hosting

MuleForge has two deployment modes:

1. Local mode — the full workflow can write the verified project to the user's Desktop.
2. Hosted mode — the public web UI can analyze and generate assets remotely, but a remote server cannot directly write to a visitor's physical Desktop.

## Recommended model

Browser -> MuleForge Server -> Generate/Verify/Test/Package -> verified artifact -> MuleForge Local Agent -> User Desktop

For a free always-on VM, Google Cloud documents an Always Free e2-micro VM allocation in supported US regions. Oracle Cloud also documents Always Free compute resources, including Ampere A1 Flex capacity, subject to account/region capacity. These options are infrastructure rather than guaranteed managed hosting.

Render is useful for a free public demo, but its free web services spin down after 15 minutes of inactivity and local filesystem changes are lost on restart/redeploy. It should not be treated as the permanent Desktop-export server.

Railway currently provides a free tier/trial for small services, but its free resources and trial limits make it better suited to evaluation than a guaranteed 24/7 production service.
