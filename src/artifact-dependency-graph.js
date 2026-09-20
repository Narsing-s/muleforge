const fs = require("node:fs");
const path = require("node:path");

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function operationId(op, index) {
  return String(op.id || op.name || `${op.method || "operation"}-${op.path || index + 1}`)
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .toLowerCase();
}

function workloadNeedsContract(config = {}) {
  const type = String(config.workloadType || "").toLowerCase();
  if (["event", "batch", "scheduled", "file", "graphql", "soap", "odata", "grpc", "asyncapi"].includes(type)) {
    return !["event", "batch", "scheduled", "file"].includes(type);
  }
  return Boolean((config.api && config.api.name) || (Array.isArray(config.operations) && config.operations.length));
}

/**
 * Builds the dependency graph for artifacts produced by existing MuleForge
 * generators. This module validates relationships; it does not generate a
 * second copy of any artifact.
 */
function buildArtifactDependencyGraph(root, config = {}) {
  const base = path.resolve(root);
  const artifactId = String((config.project || {}).artifactId || (config.project || {}).name || "mule-api");
  const api = workloadNeedsContract(config);
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const nodes = [];
  const edges = [];
  const missing = [];

  const addNode = (id, kind, file, required = true) => {
    const present = !file || exists(base, file);
    nodes.push({ id, kind, file: file || null, required, present });
    if (required && !present) missing.push({ id, file });
  };
  const edge = (from, to, relation) => edges.push({ from, to, relation });

  addNode("requirements", "requirement-model", "muleforge.yaml");
  addNode("project", "project", "pom.xml");
  addNode("runtime-manifest", "runtime", "mule-artifact.json");
  addNode("configuration", "configuration", "src/main/resources/application.yaml");
  addNode("mule", "implementation", `src/main/mule/${artifactId}.xml`);

  if (api) {
    addNode("contract", "api-contract", `src/main/resources/api/${artifactId}.raml`);
    addNode("postman", "consumer-test", `postman/${artifactId}.collection.json`);
    edge("requirements", "contract", "defines");
    edge("contract", "mule", "routes");
    edge("contract", "postman", "drives");
  }

  const dwDir = "src/main/resources/dwl";
  const dwFiles = fs.existsSync(path.join(base, dwDir))
    ? fs.readdirSync(path.join(base, dwDir)).filter(file => file.endsWith(".dwl")).map(file => path.posix.join(dwDir, file))
    : [];
  addNode("dataweave", "transformation", null, operations.length > 0 ? dwFiles.length > 0 : false);
  for (const file of dwFiles) edge("mule", "dataweave", "uses");

  addNode("munit", "test", `src/test/munit/${artifactId}-test.xml`, config.testing?.munit !== false);
  addNode("traceability", "traceability", "muleforge-traceability.json");
  addNode("ci", "ci", ".github/workflows/ci-generated.yml");
  addNode("deployment", "deployment", "docs/09-deployment/deployment-matrix.md");
  addNode("readiness", "readiness", "muleforge-generation-gate.json", false);

  edge("requirements", "mule", "implements");
  edge("requirements", "dataweave", "constrains");
  edge("requirements", "munit", "verifies");
  edge("mule", "munit", "tested-by");
  edge("mule", "traceability", "mapped-by");
  edge("mule", "ci", "built-by");
  edge("project", "mule", "packages");
  edge("runtime-manifest", "mule", "runs");
  edge("configuration", "mule", "configures");
  edge("ci", "deployment", "promotes");
  edge("munit", "ci", "executed-by");

  for (const [index, op] of operations.entries()) {
    const id = operationId(op, index);
    const nodeId = `operation:${id}`;
    nodes.push({ id: nodeId, kind: "operation", file: null, required: true, present: true, method: op.method || null, path: op.path || null });
    edge("requirements", nodeId, "specifies");
    edge(nodeId, "mule", "implemented-by");
    if (api) edge(nodeId, "contract", "contracted-by");
    edge(nodeId, "munit", "verified-by");
    if (api) edge(nodeId, "postman", "exercised-by");
    if (dwFiles.length) edge(nodeId, "dataweave", "transformed-by");
  }

  const requiredNodes = nodes.filter(node => node.required);
  const disconnected = requiredNodes.filter(node => {
    if (["requirements", "project", "runtime-manifest", "configuration", "mule"].includes(node.id)) return false;
    return !edges.some(e => e.from === node.id || e.to === node.id);
  });
  const critical = [
    ...missing.map(item => ({ code: "ARTIFACT_MISSING", message: `${item.id}: ${item.file}` })),
    ...disconnected.map(item => ({ code: "ARTIFACT_DISCONNECTED", message: item.id }))
  ];

  return {
    version: "1.0",
    artifactId,
    nodes,
    edges,
    missing,
    disconnected: disconnected.map(node => node.id),
    valid: critical.length === 0,
    critical
  };
}

function writeArtifactDependencyGraph(root, config) {
  const report = buildArtifactDependencyGraph(root, config);
  fs.writeFileSync(
    path.join(path.resolve(root), "muleforge-artifact-dependency-graph.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8"
  );
  return report;
}

module.exports = { buildArtifactDependencyGraph, writeArtifactDependencyGraph };
