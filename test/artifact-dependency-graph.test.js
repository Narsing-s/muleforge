const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildArtifactDependencyGraph, writeArtifactDependencyGraph } = require("../src/artifact-dependency-graph");

function project(root, files) {
  for (const file of files) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "");
  }
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-graph-"));
  project(root, [
    "muleforge.yaml",
    "pom.xml",
    "mule-artifact.json",
    "src/main/resources/application.yaml",
    "src/main/resources/api/demo.raml",
    "src/main/mule/demo.xml",
    "src/main/resources/dwl/health-request.dwl",
    "src/test/munit/demo-test.xml",
    "postman/demo.collection.json",
    "muleforge-traceability.json",
    ".github/workflows/ci-generated.yml",
    "docs/09-deployment/deployment-matrix.md"
  ]);
  const report = buildArtifactDependencyGraph(root, {
    project: { artifactId: "demo" },
    operations: [{ name: "health", method: "GET", path: "/health" }],
    testing: { munit: true }
  });
  assert.equal(report.valid, true);
  assert.ok(report.edges.some(edge => edge.from === "contract" && edge.to === "mule"));
  assert.ok(report.edges.some(edge => edge.from === "operation:health" && edge.to === "munit"));
  assert.equal(writeArtifactDependencyGraph(root, { project: { artifactId: "demo" }, operations: [{ name: "health", method: "GET", path: "/health" }], testing: { munit: true } }).valid, true);
  assert.ok(fs.existsSync(path.join(root, "muleforge-artifact-dependency-graph.json")));
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-graph-missing-"));
  project(root, [
    "muleforge.yaml",
    "pom.xml",
    "mule-artifact.json",
    "src/main/resources/application.yaml",
    "src/main/mule/demo.xml",
    "src/test/munit/demo-test.xml",
    "muleforge-traceability.json",
    ".github/workflows/ci-generated.yml",
    "docs/09-deployment/deployment-matrix.md"
  ]);
  const report = buildArtifactDependencyGraph(root, {
    project: { artifactId: "demo" },
    operations: [{ name: "create", method: "POST", path: "/customers" }],
    testing: { munit: true }
  });
  assert.equal(report.valid, false);
  assert.ok(report.missing.some(item => item.id === "contract"));
  assert.ok(report.missing.some(item => item.id === "postman"));
}
