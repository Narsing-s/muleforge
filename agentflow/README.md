# AgentFlow Studio

AgentFlow Studio is the product-facing MVP built on the MuleForge engineering model.

**Pitch:** Describe a business outcome in plain English and receive a structured, build-ready integration workflow.

## MVP
- Natural-language requirement input
- Workflow classification
- Trigger/source/validation/transformation/reliability/delivery/test/deployment planning
- Quality gates
- JSON export
- Reusable templates
- No API key required
- No external data is sent anywhere by the static MVP

## Product path
1. Provider abstraction for optional LLM planning.
2. Real connector catalog and execution sandbox.
3. GitHub project generation.
4. Scheduled execution and monitoring.
5. Authentication, usage limits and billing.
6. Team workspaces and reusable workflow marketplace.

The existing MuleForge generation and verification engine remains separate; this UI is a product surface for the same requirement-first engineering model.

## Run
Open agentflow/index.html locally or serve the repository with any static web server.

## Safety
The MVP never generates credentials and never claims a workflow has been deployed. A generated plan is a design artifact until connected to a real execution provider.