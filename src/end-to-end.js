const fs = require("node:fs");
const path = require("node:path");

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function expectedArtifacts(config = {}) {
  const project = config.project || {};
  const artifactId = project.artifactId || project.name || "mule-api";
  const workload = String(config.workloadType || "").toLowerCase() || (
    Array.isArray(config.operations) && config.operations.length ? "api" : "integration"
  );
  const api = workload === "api";
  return [
    { id: "project-config", path: "muleforge.yaml", required: true, category: "model" },
    { id: "maven-project", path: "pom.xml", required: true, category: "build" },
    { id: "mule-artifact", path: "mule-artifact.json", required: true, category: "runtime" },
    { id: "application-config", path: "src/main/resources/application.yaml", required: true, category: "configuration" },
    { id: "mule-implementation", path: `src/main/mule/${artifactId}.xml`, required: true, category: "implementation" },
    { id: "munit", path: `src/test/munit/${artifactId}-test.xml`, required: config.testing?.munit !== false, category: "testing" },
    { id: "traceability", path: "muleforge-traceability.json", required: true, category: "traceability" },
    { id: "traceability-doc", path: "docs/11-traceability.md", required: true, category: "traceability" },
    { id: "solution-design", path: "docs/00-solution-design/solution-design.md", required: true, category: "documentation" },
    { id: "requirements-doc", path: "docs/01-requirements/requirements.md", required: true, category: "documentation" },
    { id: "architecture-doc", path: "docs/02-architecture/architecture.md", required: true, category: "architecture" },
    { id: "flow-doc", path: "docs/06-flows/main-flow.md", required: true, category: "documentation" },
    { id: "testing-doc", path: "docs/08-testing/testing.md", required: true, category: "testing" },
    { id: "deployment-matrix", path: "docs/09-deployment/deployment-matrix.md", required: true, category: "deployment" },
    { id: "ci-workflow", path: ".github/workflows/ci-generated.yml", required: true, category: "cicd" },
    { id: "postman", path: "postman", required: api, category: "api-client" },
    { id: "raml", path: `src/main/resources/api/${artifactId}.raml`, required: workload === "api", category: "api-contract" },
    { id: "environment-dev", path: "src/main/resources/properties/application-dev.yaml", required: true, category: "configuration" },
    { id: "environment-qa", path: "src/main/resources/properties/application-qa.yaml", required: true, category: "configuration" },
    { id: "environment-uat", path: "src/main/resources/properties/application-uat.yaml", required: true, category: "configuration" },
    { id: "environment-prod", path: "src/main/resources/properties/application-prod.yaml", required: true, category: "configuration" }
  ];
}

function checkEndToEndArtifacts(root, config = {}) {
  const artifacts = expectedArtifacts(config).map(item => ({
    ...item,
    present: exists(root, item.path)
  }));
  const missing = artifacts.filter(item => item.required && !item.present);
  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    project: config.project?.name || config.project?.artifactId || "mule-api",
    architecture: config.architecture || null,
    artifacts,
    missing,
    complete: missing.length === 0
  };
}

function writeEndToEndReport(root, config = {}) {
  const report = checkEndToEndArtifacts(root, config);
  const jsonPath = path.join(root, "muleforge-generation-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  const byCategory = {};
  for (const item of report.artifacts) {
    (byCategory[item.category] ||= []).push(item);
  }
  const lines = [
    "# MuleForge End-to-End Generation Report",
    "",
    "This report is generated from the confirmed MuleForge model. It is a completeness manifest, not a claim that organization-specific business semantics or live credentials have been verified.",
    "",
    `**Complete artifact set:** ${report.complete ? "YES" : "NO"}`,
    "",
    "## Architecture decision",
    "",
    `- Style: ${report.architecture?.style || "not specified"}`,
    `- Confidence: ${report.architecture?.confidence || "not specified"}`,
    `- Decision: ${report.architecture?.decision || "not specified"}`,
    "",
    "## Generated lifecycle",
    ""
  ];
  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`### ${category}`);
    for (const item of items) lines.push(`- [${item.present ? "x" : " "}] \`${item.path}\`${item.required ? "" : " (optional)"}`);
    lines.push("");
  }
  if (report.missing.length) {
    lines.push("## Missing required artifacts", "");
    for (const item of report.missing) lines.push(`- ${item.path}`);
    lines.push("");
  }
  fs.writeFileSync(path.join(root, "docs", "13-generation-report.md"), lines.join("\n") + "\n", "utf8");
  return report;
}

module.exports = { expectedArtifacts, checkEndToEndArtifacts, writeEndToEndReport };
