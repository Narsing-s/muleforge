const test = require("node:test");
const assert = require("node:assert/strict");
const { TYPES, classifyWorkload, buildEngineeringPlan } = require("../src/workload-engine");

test("classifies REST requirements as API and requires RAML when specified", () => {
  const result = classifyWorkload({
    model: {
      requirement: "Expose REST POST /customers and return customer details.",
      api: { specification: "RAML" },
      operations: [{ method: "POST", path: "/customers" }]
    }
  });
  assert.equal(result.type, TYPES.API);
  assert.equal(result.apiContractRequired, true);
  assert.equal(result.ramlRequired, true);
});

test("classifies messaging integrations without forcing an API contract", () => {
  const result = classifyWorkload({
    model: {
      requirement: "Consume orders from Anypoint MQ and publish transformed orders to Kafka.",
      connectors: ["anypoint-mq", "kafka"]
    }
  });
  assert.equal(result.type, TYPES.EVENT);
  assert.equal(result.apiContractRequired, false);
  assert.equal(result.ramlRequired, false);
  assert.equal(result.decisions.generateEventRuntime, true);
});

test("classifies SFTP/file integrations without manufacturing RAML", () => {
  const result = classifyWorkload({
    model: {
      requirement: "Read files from SFTP every night and load them into a database.",
      connectors: ["sftp", "database"]
    }
  });
  assert.equal(result.type, TYPES.FILE);
  assert.equal(result.ramlRequired, false);
});

test("unknown workload remains explicit instead of being invented", () => {
  const result = classifyWorkload({ model: { requirement: "Move data between two enterprise systems." } });
  assert.equal(result.type, TYPES.UNKNOWN);
  assert.equal(result.developerActionRequired, true);
  assert.ok(result.assumptions.length > 0);
});

test("existing-project plans reuse the supplied model and preserve ownership boundaries", () => {
  const plan = buildEngineeringPlan(
    { project: { name: "orders" }, operations: [], connectors: ["anypoint-mq"] },
    { imported: { inventory: { files: 12, muleXml: 3, raml: 0, dataWeave: 5, munit: 4, pom: true }, semantics: {} } }
  );
  assert.equal(plan.mode, "existing-repository-engineering");
  assert.equal(plan.input, "existing-mule-repository");
  assert.equal(plan.scope.existing.muleXml, 3);
  assert.ok(plan.ownership.classes.includes("DEVELOPER_MANAGED"));
  assert.equal(plan.workload.type, TYPES.EVENT);
});
