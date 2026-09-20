const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YAML = require("yaml");
const { repairAndVerify } = require("../src/repair");

test("repairAndVerify is non-destructive and reports unresolved failures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-repair-loop-"));
  try {
    const model = {
      requirement: "Repair loop test",
      project: { name: "repair-loop", artifactId: "repair-loop" },
      api: { name: "Repair Loop", basePath: "/api/v1" },
      operations: []
    };
    fs.writeFileSync(path.join(root, "muleforge.yaml"), YAML.stringify(model), "utf8");
    const before = fs.readFileSync(path.join(root, "muleforge.yaml"), "utf8");
    const report = repairAndVerify(root);
    assert.equal(report.ready, false);
    assert.ok(Array.isArray(report.passes));
    assert.equal(fs.readFileSync(path.join(root, "muleforge.yaml"), "utf8"), before);
    assert.ok(fs.existsSync(path.join(root, ".gitignore")));
    assert.match(report.reason, /unresolved|verification/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
