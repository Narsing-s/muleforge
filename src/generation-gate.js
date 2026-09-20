const path = require("node:path");
const fs = require("node:fs");
const { checkEndToEndArtifacts } = require("./end-to-end");
const { verifyProject } = require("./verify");
const { validateContract, validateDeployment, validateOperationPolicies } = require("./contract-validator");
const { validateConfigValues } = require("./config-schema");
const { auditConnectors } = require("./connector-audit");
const { auditProject } = require("./quality-audit");
const { scanSecrets } = require("./security-scan");
const { validateDirectory } = require("./dataweave-validator");
const { checkRuntimeCompatibility } = require("./runtime-compatibility");
const { writeArtifactDependencyGraph } = require("./artifact-dependency-graph");

function runGenerationGate(configFile, options = {}) {
  const configPath = path.resolve(configFile);
  const root = path.resolve(path.dirname(configPath));
  const config = options.config || require("yaml").parse(fs.readFileSync(configPath, "utf8")) || {};
  const e2e = checkEndToEndArtifacts(root, { ...config, workloadType: options.workloadType || config.workloadType });
  const verification = verifyProject(configPath, { build: options.build !== false });
  const contract = validateContract(configPath);
  const configuration = validateConfigValues(config);
  const deployment = validateDeployment(config.deployment || {});
  const policies = validateOperationPolicies(config.operations || []);
  const connectors = auditConnectors(configPath);
  const audit = auditProject(configPath);
  const security = scanSecrets(root);
  const dataweave = validateDirectory(root);
  const compatibility = checkRuntimeCompatibility(config, root);
  const artifactGraph = writeArtifactDependencyGraph(root, config);

  const checks = [
    { id: "end-to-end-artifacts", passed: e2e.complete, detail: e2e },
    { id: "requirement-verification", passed: verification.ready, detail: verification },
    { id: "api-contract", passed: contract.valid, detail: contract },
    { id: "configuration", passed: configuration.valid, detail: configuration },
    { id: "deployment", passed: deployment.valid, detail: deployment },
    { id: "operation-policies", passed: policies.valid, detail: policies },
    { id: "connector-integrity", passed: connectors.ready, detail: connectors },
    { id: "project-quality", passed: audit.ready, detail: audit },
    { id: "secret-scan", passed: security.length === 0, detail: security },
    { id: "dataweave-static-validation", passed: dataweave.valid, detail: dataweave },
    { id: "runtime-compatibility", passed: compatibility.valid, detail: compatibility },
    { id: "artifact-dependency-graph", passed: artifactGraph.valid, detail: artifactGraph }
  ];

  const failed = checks.filter(check => !check.passed);
  const report = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    status: failed.length ? "blocked" : "verified",
    project: config.project || {},
    checks,
    failed: failed.map(check => check.id),
    rule: "Desktop export is allowed only after every mandatory static generation gate passes. A verified generation does not imply live deployment or organization-specific credentials were tested."
  };

  fs.writeFileSync(path.join(root, "muleforge-generation-gate.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  const lines = [
    "# MuleForge Generation Gate",
    "",
    `**Status:** ${report.status.toUpperCase()}`,
    "",
    "MuleForge will not export the generated project to Desktop while a mandatory static gate is blocked.",
    "",
    "## Gates",
    "",
    ...checks.map(check => `- [${check.passed ? "x" : " "}] **${check.id}**`),
    "",
    "## Artifact dependency graph",
    "",
    `- Nodes: ${artifactGraph.nodes.length}`,
    `- Edges: ${artifactGraph.edges.length}`,
    `- Missing artifacts: ${artifactGraph.missing.length}`,
    `- Disconnected required artifacts: ${artifactGraph.disconnected.length}`,
    "",
    "The graph validates relationships among the requirement model, API contract, Mule implementation, DataWeave, MUnit, Postman, CI/CD, deployment, configuration and traceability assets without introducing a second generator.",
    "",
    "## Verification boundary",
    "",
    "- Static generation and consistency gates are mandatory.",
    "- Live deployment, external credentials, and organization infrastructure are not claimed as verified unless separately exercised.",
    ""
  ];
  fs.writeFileSync(path.join(root, "docs", "14-generation-gate.md"), lines.join("\n"), "utf8");

  return report;
}

module.exports = { runGenerationGate };
