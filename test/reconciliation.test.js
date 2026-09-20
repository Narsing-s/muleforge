const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YAML = require("yaml");
const { reconcileProject, writeReconciliation } = require("../src/reconciliation");

test("reconciliation identifies missing, drifted and extra operations without copying source assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-reconcile-"));
  fs.mkdirSync(path.join(root, "src/main/mule"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/main/resources/api"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/main/resources/dwl"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/test/munit"), { recursive: true });
  fs.writeFileSync(path.join(root, "pom.xml"), "<project/>");
  fs.writeFileSync(path.join(root, "src/main/resources/api/api.raml"), "#%RAML 1.0");
  fs.writeFileSync(path.join(root, "src/main/mule/api.xml"), '<mule><flow name="customers"><http:listener method="GET" path="/customers"/></flow></mule>');
  const model = {
    project: { name: "customer-api" },
    operations: [
      { name: "get-customers", method: "GET", path: "/customers", connector: "http" },
      { name: "post-customers", method: "POST", path: "/customers", connector: "database" }
    ]
  };
  const report = reconcileProject(model, root);
  assert.equal(report.summary.implemented, 1);
  assert.equal(report.summary.missing, 1);
  assert.equal(report.summary.connectorDrift, 0);
  assert.equal(report.summary.extraExistingOperations, 0);
  const source = fs.readFileSync(path.join(root, "src/main/mule/api.xml"), "utf8");
  assert.equal(source, '<mule><flow name="customers"><http:listener method="GET" path="/customers"/></flow></mule>');
});

test("reconciliation report references source assets instead of duplicating them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-reconcile-"));
  fs.writeFileSync(path.join(root, "muleforge.yaml"), YAML.stringify({
    project: { name: "api" },
    operations: [{ name: "health", method: "GET", path: "/health", connector: "http" }]
  }));
  fs.writeFileSync(path.join(root, "pom.xml"), "<project/>");
  const report = writeReconciliation(path.join(root, "muleforge.yaml"), root);
  assert.equal(report.preservation.sourceRepositoryUntouched, true);
  assert.equal(fs.existsSync(path.join(root, "muleforge-reconciliation.json")), true);
  assert.equal(fs.existsSync(path.join(root, "docs/12-reconciliation.md")), true);
});
