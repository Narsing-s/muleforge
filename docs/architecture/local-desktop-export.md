# Local Desktop Export

The Desktop export contract is intentionally fail-closed.

Requirement -> Analysis -> Temporary staging -> MuleForge generation -> Static verification -> Maven tests -> Maven package -> Copy verification -> Atomic Desktop handoff

The generated project is never written directly to the final Desktop directory during generation.

If a gate fails:
- the temporary staging directory is deleted;
- no final Desktop project is created;
- an error is returned to the UI.

After success, MuleForge writes muleforge-generation-report.json containing the requirement, verification result and generated-file manifest.

The browser cannot grant a remote server access to a user's physical Desktop. For a hosted product, add a small local agent that receives only verified artifacts and performs the final Desktop write.
