const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runGenerationGate } = require("../src/generation-gate");

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-generation-gate-"));
  const configPath = path.join(root, "muleforge.yaml");
  fs.writeFileSync(configPath, [
    "requirement: Build a customer API.",
    "project:",
    "  name: demo",
    "  artifactId: demo",
    "  muleRuntime: '4.9.0'",
    "  java: '17'",
    "operations:",
    "  - name: health",
    "    method: GET",
    "    path: /health",
    "    connector: http",
    "    responseFields:",
    "      - name: status",
    "        type: string",
    "    errors:",
    "      - status: 500",
    "connectors:",
    "  - http",
    "testing:",
    "  munit: true",
    "deployment:",
    "  target: none",
    ""
  ].join("\n"));

  const report = runGenerationGate(configPath);
  assert.equal(report.status, "blocked");
  assert.ok(report.failed.length > 0);
  assert.ok(fs.existsSync(path.join(root, "muleforge-generation-gate.json")));
  assert.ok(fs.existsSync(path.join(root, "docs", "14-generation-gate.md")));
}
