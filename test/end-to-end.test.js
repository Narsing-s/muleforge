const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeEndToEndReport, checkEndToEndArtifacts } = require("../src/end-to-end");

function makeProject(root, api = true) {
  const files = [
    "muleforge.yaml",
    "pom.xml",
    "mule-artifact.json",
    "src/main/resources/application.yaml",
    "src/main/mule/demo.xml",
    "src/test/munit/demo-test.xml",
    "muleforge-traceability.json",
    "docs/11-traceability.md",
    "docs/00-solution-design/solution-design.md",
    "docs/01-requirements/requirements.md",
    "docs/02-architecture/architecture.md",
    "docs/06-flows/main-flow.md",
    "docs/08-testing/testing.md",
    "docs/09-deployment/deployment-matrix.md",
    ".github/workflows/ci-generated.yml",
    "src/main/resources/properties/application-dev.yaml",
    "src/main/resources/properties/application-qa.yaml",
    "src/main/resources/properties/application-uat.yaml",
    "src/main/resources/properties/application-prod.yaml"
  ];
  if (api) files.push("src/main/resources/api/demo.raml", "postman/demo.collection.json");
  for (const file of files) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "");
  }
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-e2e-"));
  makeProject(root, true);
  const config = {
    project: { name: "demo", artifactId: "demo" },
    testing: { munit: true },
    operations: [{ method: "GET", path: "/health" }],
    architecture: { style: "MuleSoft API-led connectivity", confidence: "high", decision: "Use the documented three-layer API-led structure." }
  };
  const report = writeEndToEndReport(root, { ...config, workloadType: "api" });
  assert.equal(report.complete, true);
  assert.equal(checkEndToEndArtifacts(root, { ...config, workloadType: "api" }).complete, true);
  assert.ok(fs.existsSync(path.join(root, "muleforge-generation-report.json")));
  assert.ok(fs.existsSync(path.join(root, "docs/13-generation-report.md")));
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-e2e-missing-"));
  makeProject(root, false);
  const config = {
    project: { name: "demo", artifactId: "demo" },
    testing: { munit: false },
    operations: [{ method: "POST", path: "/process" }]
  };
  const report = checkEndToEndArtifacts(root, { ...config, workloadType: "api" });
  assert.equal(report.complete, false);
  assert.ok(report.missing.some(item => item.path === "src/main/resources/api/demo.raml"));
  assert.ok(report.missing.some(item => item.path === "postman"));
}
