const test = require("node:test");
const assert = require("node:assert/strict");
const { TYPES, classifyWorkload, buildEngineeringPlan, buildLifecycleState, explainOperation, buildChangeImpact, buildCoverageMatrix, buildDependencyEvidence, buildRuntimeEvidence } = require("../src/workload-engine");

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
      requirement: "Read files from SFTP and load them into a database.",
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


test("classifies scheduled file/database workloads without inventing an API", () => {
  const result = classifyWorkload({
    model: {
      requirement: "Every night at 2 AM read files from SFTP and load them into the database.",
      connectors: ["sftp", "database"]
    }
  });
  assert.equal(result.type, TYPES.FILE);
  assert.ok(result.capabilities.includes("scheduler"));
  assert.ok(result.capabilities.includes("file-transfer"));
  assert.equal(result.ramlRequired, false);
});


test("retains trigger and transport evidence for composite file/schedule integrations", () => {
  const result = classifyWorkload({
    model: {
      requirement: "Every night read customer files from SFTP and load them into the database.",
      connectors: ["sftp", "database"],
      deployment: { target: "cloudhub-2" }
    }
  });
  assert.equal(result.type, TYPES.FILE);
  assert.equal(result.trigger, "scheduler");
  assert.ok(result.transports.includes("sftp"));
  assert.equal(result.deploymentTarget, "cloudhub-2");
});

test("engineering plan exposes workload-specific artifacts without duplicating generators", () => {
  const plan = buildEngineeringPlan({
    requirement: "Consume order events from Anypoint MQ and publish to Salesforce.",
    connectors: ["anypoint-mq", "salesforce"],
    testing: { munit: true }
  });
  assert.equal(plan.workload.type, TYPES.EVENT);
  assert.deepEqual(plan.artifactPlan.contract, ["workload-specific Mule implementation", "MUnit"]);
  assert.ok(plan.pipeline.includes("deployment-preflight"));
  assert.ok(plan.ownership.classes.includes("EXTERNAL"));
});


test("engineering plan exposes gated lifecycle and certainty states", () => {
  const plan = buildEngineeringPlan({
    requirement: "Nightly read customer records from SFTP.",
    connectors: ["sftp"],
    deployment: { target: "cloudhub-2" }
  });
  assert.equal(plan.lifecycle.current, "DESIGNED");
  assert.ok(plan.lifecycle.states.includes("PROD-VERIFIED"));
  assert.equal(plan.certainty.workload, "inferred");
  assert.equal(plan.deployment.recognized, true);
});

test("operation explanation returns source-backed remediation when missing", () => {
  const imported = {
    operations: [{ method: "POST", path: "/customers", name: "post-customers", connector: "http", source: "src/main/mule/customers.xml" }],
    semantics: { flows: [], flowRefs: [], errorHandlers: [] },
    inventory: { munit: 1, raml: 1 }
  };
  const found = explainOperation(imported, "POST:/customers");
  assert.equal(found.found, true);
  assert.equal(found.operations[0].source, "src/main/mule/customers.xml");
  const missing = explainOperation(imported, "GET:/orders");
  assert.equal(missing.found, false);
  assert.ok(missing.remediation.affectedArtifacts.includes("traceability"));
});


test("engineering evidence includes change impact, coverage, dependencies and runtime boundary without duplicate engines", () => {
  const imported = {
    operations: [{ method: "POST", path: "/customers", source: "src/main/mule/customers.xml" }],
    operationEvidence: [{ operation: "POST /customers", source: "src/main/mule/customers.xml", state: "confirmed" }],
    inventory: { raml: 1, dataWeave: 2, munit: 1, pom: true },
    assetInventory: { raml: ["api.raml"], dataWeave: ["post.dwl"], munit: ["customers-test.xml"] },
    dependencyEvidence: [{ groupId: "com.example", artifactId: "example-connector", version: "1.0.0", state: "confirmed" }],
    exchangeDependencies: [{ dependency: "com.example:shared-fragment:1.0.0", state: "confirmed" }],
    semantics: { errorHandlers: [{ type: "on-error-propagate" }] }
  };
  const model = { operations: imported.operations, api: { specification: "RAML" }, deployment: { target: "cloudhub-2" } };
  const plan = buildEngineeringPlan(model, { imported });
  assert.equal(plan.coverage.operations[0].implementation, "confirmed");
  assert.equal(plan.dependencies.status, "confirmed");
  assert.equal(plan.runtimeEvidence.status, "not-verified");
  assert.equal(plan.impact.operations[0].reviewBeforeRegeneration, true);
  assert.equal(buildDependencyEvidence(imported).exchange.length, 1);
  assert.equal(buildRuntimeEvidence(model, imported).runtime.verified, false);
  assert.equal(buildChangeImpact(model, imported).operations.length, 1);
  assert.equal(buildCoverageMatrix(model, imported).totals.confirmedTests, 1);
});


test("classifies the remaining supported workload families without forcing REST artifacts", () => {
  const cases = [
    [{ requirement: "Process a batch of 10000 records with chunking." }, TYPES.BATCH],
    [{ requirement: "Expose a SOAP service defined by WSDL.", wsdl: "orders.wsdl" }, TYPES.SOAP],
    [{ requirement: "Expose a GraphQL query and mutation API.", graphql: true }, TYPES.GRAPHQL],
    [{ requirement: "Synchronize Salesforce records with a database.", connectors: ["salesforce", "database"] }, TYPES.INTEGRATION]
  ];
  for (const [model, expected] of cases) {
    const result = classifyWorkload({ model });
    assert.equal(result.type, expected);
    assert.equal(result.apiContractRequired, [TYPES.SOAP, TYPES.GRAPHQL].includes(expected));
    if (expected !== TYPES.GRAPHQL && expected !== TYPES.SOAP) assert.equal(result.ramlRequired, false);
  }
});


test("repository trigger evidence classifies scheduler-only and batch workloads", () => {
  const scheduled = classifyWorkload({
    model: {},
    imported: { semantics: { triggers: [{ type: "scheduler" }] } }
  });
  assert.equal(scheduled.type, TYPES.SCHEDULED);
  assert.ok(scheduled.capabilities.includes("scheduler"));

  const batch = classifyWorkload({
    model: {},
    imported: { semantics: { triggers: [{ type: "batch:job" }] } }
  });
  assert.equal(batch.type, TYPES.BATCH);
});
