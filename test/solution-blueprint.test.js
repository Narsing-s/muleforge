const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSolutionBlueprint, validateSolutionBlueprint } = require("../src/solution-blueprint");

test("solution blueprint composes the canonical requirement model without duplicating generators", () => {
  const model = {
    requirement: "Build an API-led customer API using an Experience API, Process API and System API. Protect it with OAuth2.",
    project: { name: "customer-api", artifactId: "customer-api" },
    api: { name: "Customer API", basePath: "/api/v1", specification: "RAML" },
    architecture: {
      style: "MuleSoft API-led connectivity",
      layers: ["Experience API", "Process API", "System API"],
      decision: "Use the documented API-led layers."
    },
    connectors: ["http", "database"],
    operations: [{
      name: "createCustomer",
      method: "POST",
      path: "/customers",
      connector: "database",
      requestFields: [{ name: "name", type: "string", required: true }],
      responseFields: [{ name: "id", type: "string" }],
      errors: [{ code: "CONFLICT", status: 409 }],
      successStatus: 201
    }],
    deployment: { target: "cloudhub-2" },
    testing: { munit: true }
  };
  const blueprint = buildSolutionBlueprint(model);
  assert.equal(blueprint.sourceOfTruth, "confirmed MuleForge requirement/project model");
  assert.equal(blueprint.workload.type, "api");
  assert.deepEqual(blueprint.architecture.layers, ["Experience API", "Process API", "System API"]);
  assert.deepEqual(blueprint.security.schemes, ["oauth2"]);
  assert.equal(blueprint.integration.semanticIRValid, true);
  assert.equal(blueprint.delivery.contract, "required");
  assert.equal(validateSolutionBlueprint(model, blueprint).valid, true);
});

test("blueprint blocks unresolved conflicts and unknown workloads", () => {
  const model = {
    requirement: "Something unclear",
    conflicts: [{ type: "connectivity" }],
    project: { name: "unknown" }
  };
  const result = validateSolutionBlueprint(model);
  assert.equal(result.valid, false);
  assert.ok(result.critical.some(x => x.code === "BLUEPRINT_CONFLICTS"));
  assert.ok(result.critical.some(x => x.code === "BLUEPRINT_WORKLOAD_UNKNOWN"));
});

test("blueprint preserves end-to-end engineering decisions instead of hardcoding delivery details", () => {
  const model = {
    requirement: "Deploy independently deployable applications for the Experience and Process APIs. Monitor correlation IDs and latency.",
    requirements: [
      { id: "REQ-001", text: "Validate email before creating a customer.", source: "requirements.docx" },
      { id: "REQ-002", text: "Return 409 when the customer already exists.", source: "requirements.docx", businessRule: "Customer identity must be unique." }
    ],
    project: { name: "customer-platform", artifactId: "customer-platform" },
    api: { specification: "RAML" },
    architecture: { layers: ["Experience API", "Process API"] },
    operations: [{
      id: "OP-001",
      name: "createCustomer",
      method: "POST",
      path: "/customers",
      validation: ["email format"],
      errors: [{ status: 409, code: "DUPLICATE" }],
      requestFields: [{ name: "email", type: "string", required: true }],
      responseFields: [{ name: "id", type: "string" }],
      retry: { maxAttempts: 3 },
      idempotency: true
    }],
    deployment: { target: "cloudhub-2", promotionEnvironments: ["dev", "qa", "prod"] }
  };
  const blueprint = buildSolutionBlueprint(model);
  assert.equal(blueprint.projectTopology.mode, "multi-project-required");
  assert.deepEqual(blueprint.delivery.environments, ["dev", "qa", "prod"]);
  assert.equal(blueprint.businessRules.operationRules[0].reliability.idempotency, true);
  assert.equal(blueprint.businessRules.requirementRules[0].rule, "Customer identity must be unique.");
  assert.equal(blueprint.observability.required, true);
  const validation = validateSolutionBlueprint(model, blueprint);
  assert.equal(validation.valid, false);
  assert.ok(validation.critical.some(x => x.code === "BLUEPRINT_MULTI_PROJECT_ORCHESTRATION_REQUIRED"));
});
