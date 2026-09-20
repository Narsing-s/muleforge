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
