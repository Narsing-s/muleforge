const test = require("node:test");
const assert = require("node:assert/strict");
const { buildIntegrationIR, validateIntegrationIR, normalizeConnector } = require("../src/semantic-ir");

test("semantic IR canonicalizes connector aliases", () => {
  assert.equal(normalizeConnector("IBM MQ"), "ibm-mq");
  assert.equal(normalizeConnector("postgresql"), "database");
  const ir = buildIntegrationIR({
    connectors: ["HTTP", "IBM MQ"],
    operations: [{ name: "publish", method: "POST", path: "/messages", connector: "IBM MQ" }]
  });
  assert.deepEqual(ir.connectors, ["http", "ibm-mq"]);
  assert.equal(ir.operations[0].connector, "ibm-mq");
  assert.equal(ir.version, "1.1");
});

test("semantic IR rejects duplicate operations, undeclared connectors and invalid schemas", () => {
  const ir = buildIntegrationIR({
    connectors: ["http"],
    operations: [
      { name: "a", method: "GET", path: "/customers", connector: "http", responseFields: [{ name: "id", type: "uuid" }] },
      { name: "b", method: "GET", path: "/customers", connector: "http" },
      { name: "c", method: "POST", path: "/orders", connector: "kafka", successStatus: 418 }
    ]
  });
  const report = validateIntegrationIR(ir);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(x => x.includes("Duplicate operation")));
  assert.ok(report.errors.some(x => x.includes("Unsupported request") || x.includes("Unsupported response")));
  assert.ok(report.errors.some(x => x.includes("not declared in connectors")));
  assert.ok(report.errors.some(x => x.includes("Invalid success status")));
});

test("semantic IR accepts a canonical valid operation", () => {
  const ir = buildIntegrationIR({
    connectors: ["http", "database"],
    operations: [{
      name: "createCustomer",
      method: "POST",
      path: "/customers",
      connector: "database",
      requestFields: [{ name: "email", type: "string", required: true }],
      responseFields: [{ name: "id", type: "integer" }],
      successStatus: 201,
      errorStatuses: [400, 409, 500]
    }]
  });
  const report = validateIntegrationIR(ir);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
});
