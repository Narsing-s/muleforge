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
  const soap = workload === "soap";
  const graphql = workload === "graphql";
  const event = workload === "event" || Array.isArray(config.events) || Array.isArray(config.triggers);
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
    { id: "raml", path: `src/main/resources/api/${artifactId}.raml`, required: api, category: "api-contract" },
    { id: "graphql-contract", path: "src/main/resources/api/schema.graphql", required: graphql, category: "api-contract" },
    { id: "soap-contract", path: `src/main/resources/api/${artifactId}.wsdl`, required: soap && Boolean(config.wsdl || config.api?.wsdl), category: "api-contract" },
    { id: "event-runtime", path: "src/main/mule/muleforge-events.xml", required: event && ((config.events || []).length > 0 || (config.triggers || []).length > 0), category: "implementation" },
    { id: "environment-dev", path: "src/main/resources/properties/application-dev.yaml", required: true, category: "configuration" },
    { id: "environment-qa", path: "src/main/resources/properties/application-qa.yaml", required: true, category: "configuration" },
    { id: "environment-uat", path: "src/main/resources/properties/application-uat.yaml", required: true, category: "configuration" },
    { id: "environment-prod", path: "src/main/resources/properties/application-prod.yaml", required: true, category: "configuration" }
  ];
}

function requirementCoverage(config = {}) {
  const issues = [];
  const requirement = String(config.requirement || "").trim();
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const workload = String(config.workloadType || "").toLowerCase();
  const conflicts = Array.isArray(config.conflicts) ? config.conflicts : [];
  if (!requirement) issues.push({ severity: "critical", code: "REQUIREMENT_MISSING", message: "No requirement text was preserved in the generated model." });
  if (conflicts.length) issues.push({ severity: "critical", code: "REQUIREMENT_CONFLICT", message: `${conflicts.length} unresolved requirement conflict(s) remain.` });
  if (["api","soap","graphql"].includes(workload) && !operations.length) {
    issues.push({ severity: "critical", code: "OPERATIONS_MISSING", message: "An API workload was selected but no operations were confirmed." });
  }
  operations.forEach(op => {
    const method = String(op.method || "").toUpperCase();
    const bodyMethod = ["POST","PUT","PATCH"].includes(method);
    if (!op.path) issues.push({ severity: "critical", code: "PATH_MISSING", operation: op.name || method, message: "An operation has no resource path." });
    if (!method) issues.push({ severity: "critical", code: "METHOD_MISSING", operation: op.name || "unnamed", message: "An operation has no HTTP method." });
    if (bodyMethod && !Array.isArray(op.requestFields)) issues.push({ severity: "warning", code: "REQUEST_SCHEMA_UNCONFIRMED", operation: op.name || method, message: "Request fields were not confirmed; generated request schema may be incomplete." });
    if (!Array.isArray(op.responseFields) || !op.responseFields.length) issues.push({ severity: "warning", code: "RESPONSE_SCHEMA_UNCONFIRMED", operation: op.name || method, message: "Success response fields were not confirmed." });
    if (!Array.isArray(op.errors) || !op.errors.length) issues.push({ severity: "warning", code: "ERROR_CASES_UNCONFIRMED", operation: op.name || method, message: "Business/dependency error cases were not confirmed." });
  });
  return {
    version: "1.1",
    issues,
    critical: issues.filter(x => x.severity === "critical"),
    warnings: issues.filter(x => x.severity === "warning"),
    complete: !issues.some(x => x.severity === "critical")
  };
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
    requirements: requirementCoverage(config),
    complete: missing.length === 0 && requirementCoverage(config).complete
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
    `**Complete generation contract:** ${report.complete ? "YES" : "NO"}`,
    "",
    `**Requirement coverage:** ${report.requirements.complete ? "CONFIRMED" : "BLOCKED BY CRITICAL GAPS"}`,
    "",
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
  if (report.requirements.issues.length) {
    lines.push("## Requirement coverage and unresolved assumptions", "");
    for (const issue of report.requirements.issues) lines.push(`- **${issue.severity.toUpperCase()}** \\`${issue.code}\\`: ${issue.message}${issue.operation ? ` (operation: ${issue.operation})` : ""}`);
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

module.exports = { expectedArtifacts, requirementCoverage, checkEndToEndArtifacts, writeEndToEndReport };
