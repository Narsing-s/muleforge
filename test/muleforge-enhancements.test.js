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


test("contract validator rejects malformed routes and unsupported methods", () => {
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const { validateContract } = require("../src/contract-validator");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-contract-")); const file = path.join(temp, "muleforge.yaml");
  fs.writeFileSync(file, "operations:\n  - name: bad\n    method: TRACE\n    path: customers\n    successStatus: 200\n", "utf8");
  const report = validateContract(file); assert.equal(report.valid, false); assert.ok(report.errors.some(x => x.includes("Unsupported HTTP method"))); assert.ok(report.errors.some(x => x.includes("must start")));
});

test("reference Mule XML contains only one database config", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const xml = fs.readFileSync(path.resolve(__dirname, "../customer-api/src/main/mule/customer-api.xml"), "utf8");
  assert.equal(xml.split("<db:config ").length - 1, 1);
});
