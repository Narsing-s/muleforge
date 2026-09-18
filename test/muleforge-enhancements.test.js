const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveConnectors } = require("../src/connectors");
const { buildTraceability } = require("../src/traceability");
const { inspectProject } = require("../src/project-inspector");

test("enterprise connectors resolve", () => {
  const ids = resolveConnectors(["file","email","jms","kafka","salesforce"]).map(x => x.id);
  assert.deepEqual(ids, ["file","email","jms","kafka","salesforce"]);
});

test("traceability maps operations", () => {
  const report = buildTraceability({ operations: [{name:"getCustomer",method:"GET",path:"/customers"}], requirements: [] });
  assert.equal(report.operationCount, 1);
  assert.deepEqual(report.operations[0].targets, ["raml","mule","dataweave","munit","postman","documentation"]);
});

test("inspector returns a safe report for an arbitrary directory", () => {
  const report = inspectProject(".");
  assert.equal(typeof report.files, "number");
  assert.equal(typeof report.readyForMigrationReview, "boolean");
});
