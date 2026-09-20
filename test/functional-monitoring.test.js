const test = require("node:test");
const assert = require("node:assert/strict");
const { generateFunctionalMonitoringSuite, generateBatManifest, generateBatConfig, writeFunctionalMonitoring } = require("../src/functional-monitoring");
const YAML = require("yaml");
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
  assert.match(suite, /Content-Type/);
  assert.match(suite, /config.id/);
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
    assert.ok(fs.existsSync(path.join(root, "functional-monitoring/bat.yaml")));
    assert.ok(fs.existsSync(path.join(root, "functional-monitoring/reports")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test("generated BAT manifest is valid YAML and points to the generated test", () => {
  const manifest = generateBatManifest("customer-api");
  const parsed = YAML.parse(manifest);
  assert.equal(parsed.suite.name, "customer-api Functional Monitoring");
  assert.deepEqual(parsed.files, [{ file: "tests/customer-api.dwl" }]);
  assert.ok(Array.isArray(parsed.reporters));
});

test("generated BAT config contains only required non-secret placeholders", () => {
  const config = JSON.parse(generateBatConfig({
    operations: [
      { method: "GET", path: "/customers", security: "oauth2" },
      { method: "POST", path: "/customers", security: "client-id" }
    ]
  }));
  assert.equal(config.baseUrl, "https://SET_ME");
  assert.equal(config.id, "SET_ME");
  assert.equal(config.clientId, "SET_ME");
  assert.equal(config.accessToken, "SET_ME");
  assert.equal(config.basicAuth, undefined);
  assert.doesNotMatch(JSON.stringify(config), /REPLACE_WITH_|CLIENT_SECRET|ACCESS_TOKEN/i);
});
