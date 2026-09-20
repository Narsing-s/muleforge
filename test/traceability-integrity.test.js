const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("traceability writer produces valid JSON and markdown", () => {
  const { writeTraceability } = require("../src/traceability");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-traceability-"));
  try {
    const report = writeTraceability(root, {
      project: { artifactId: "customer-api" },
      requirement: "Create a customer API",
      operations: [{
        name: "create",
        method: "POST",
        path: "/customers",
        validation: ["email is required"],
        errorStatuses: [409, 422]
      }]
    });
    assert.equal(report.operationCount, 1);
    const json = JSON.parse(fs.readFileSync(path.join(root, "muleforge-traceability.json"), "utf8"));
    assert.equal(json.operations[0].rules.length, 3);
    const markdown = fs.readFileSync(path.join(root, "docs/11-traceability.md"), "utf8");
    assert.match(markdown, /Rules → executable tests/);
    assert.match(markdown, /create-status-422/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
