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

test("generated Mule XML contains only one database config", () => {
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path"); const { execFileSync } = require("node:child_process");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-db-")); const cfg = path.join(temp, "muleforge.yaml");
  fs.writeFileSync(cfg, "project:\n  name: db-api\n  artifactId: db-api\napi:\n  name: db-api\n  basePath: /api/v1\ndatabase:\n  type: generic\nconnectors: [http]\noperations:\n  - name: get_customer\n    method: GET\n    path: /customers\n", "utf8");
  execFileSync(process.execPath, [path.resolve(__dirname, "../src/index.js"), "generate", cfg], { encoding: "utf8" });
  const xml = fs.readFileSync(path.join(temp, "src/main/mule/db-api.xml"), "utf8"); assert.equal((xml.match(/<db:config\\b/g) || []).length, 1);
});
