const test = require("node:test");
const assert = require("node:assert/strict");
const { generateFunctionalMonitoringSuite, writeFunctionalMonitoring } = require("../src/functional-monitoring");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("functional monitoring suite covers every confirmed API operation", () => {
  const suite = generateFunctionalMonitoringSuite({
    operations: [
      { name: "createCustomer", method: "POST", path: "/customers", requestFields: ["name"], successStatus: 201 },
      { name: "getCustomer", method: "GET", path: "/customers/{id}", successStatus: 200 }
    ]
  }, { basePath: "/api/v1" });
  assert.match(suite, /describe/);
  assert.match(suite, /POST/);
  assert.match(suite, /GET/);
  assert.match(suite, /mustEqual 201/);
  assert.match(suite, /mustEqual 200/);
});

test("functional monitoring artifacts are written only for API workloads", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-afm-"));
  try {
    const result = writeFunctionalMonitoring(root, {
      operations: [{ name: "get", method: "GET", path: "/customers" }]
    }, { workloadType: "api", artifactId: "customer-api", basePath: "/api/v1" });
    assert.equal(result.suite, "functional-monitoring/tests/customer-api.dwl");
    assert.ok(fs.existsSync(path.join(root, result.suite)));
    assert.ok(fs.existsSync(path.join(root, "functional-monitoring/config/dev-environment.dwl")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
