const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const YAML = require("yaml");
const { writeReadiness } = require("../src/readiness");

test("readiness aggregates existing gates without replacing them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-readiness-"));
  try {
    const model = {
      requirement: "Expose a customer health API.",
      project: { name: "customer-api", artifactId: "customer-api", muleRuntime: "4.9.0", java: "17" },
      api: { name: "Customer API", version: "v1", basePath: "/api/v1", type: "System API" },
      connectors: ["http"],
      operations: [{
        name: "health",
        method: "GET",
        path: "/health",
        connector: "http",
        requestFields: [],
        responseFields: [{ name: "status", type: "string" }],
        successStatus: 200,
        errors: [{ status: 500, description: "Unexpected error" }]
      }],
      testing: { munit: true },
      deployment: { target: "none" }
    };
    const cfg = path.join(root, "muleforge.yaml");
    fs.writeFileSync(cfg, YAML.stringify(model));
    writeReadiness(cfg, root);
    const report = JSON.parse(fs.readFileSync(path.join(root, "muleforge-readiness.json"), "utf8"));
    assert.equal(report.mode, "unified-engineering-readiness");
    assert.ok(report.stages.requirements);
    assert.ok(report.stages.architecture);
    assert.ok(report.stages.implementation);
    assert.ok(report.stages.deployment);
    assert.equal(report.stages.runtime.status, "not-verified");
    assert.equal(fs.existsSync(path.join(root, "docs", "13-engineering-readiness.md")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
