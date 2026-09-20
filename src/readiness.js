const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { validateApiGovernance } = require("./api-governance");
const { validateContract, validateDeployment, validateOperationPolicies } = require("./contract-validator");
const { validateConfigValues } = require("./config-schema");
const { auditConnectors } = require("./connector-audit");
const { verifyProject } = require("./verify");
const { auditProject } = require("./quality-audit");
const { checkRuntimeCompatibility } = require("./runtime-compatibility");
const { inferApiLedArchitecture } = require("./architecture");
const { classifyWorkload, buildChangeImpact, buildCoverageMatrix, buildDependencyEvidence, buildRuntimeEvidence } = require("./workload-engine");

function loadModel(configFile) {
  const full = path.resolve(configFile);
  if (!fs.existsSync(full)) throw new Error("Configuration not found: " + configFile);
  return { full, root: path.dirname(full), model: YAML.parse(fs.readFileSync(full, "utf8")) || {} };
}

function stage(status, checks, detail) {
  return { status, checks, detail };
}

function buildReadiness(configFile = "muleforge.yaml", directory = null) {
  const loaded = loadModel(configFile);
  const root = path.resolve(directory || loaded.root);
  const model = loaded.model;
  const workload = classifyWorkload({ model });
  const apiWorkload = workload.type === "api";
  const imported = model.imported || {};
  const engineeringEvidence = { impact: buildChangeImpact(model, imported), coverage: buildCoverageMatrix(model, imported), dependencies: buildDependencyEvidence(imported), runtime: buildRuntimeEvidence(model, imported) };

  const governance = apiWorkload ? validateApiGovernance(model) : { valid: true, status: "not-applicable", detail: "API governance is not required for a non-API workload." };
  const contract = apiWorkload ? validateContract(loaded.full) : { valid: true, status: "not-applicable", detail: "API contract validation is not required for a non-API workload." };
  const configuration = validateConfigValues(model);
  const deployment = validateDeployment(model.deployment || {});
  const policies = validateOperationPolicies(model.operations || []);
  const connectors = auditConnectors(loaded.full);
  const verification = verifyProject(loaded.full);
  const audit = auditProject(loaded.full);
  const compatibility = checkRuntimeCompatibility(model, root);

  const architecture = model.architecture || inferApiLedArchitecture({
    text: [model.requirement, model.api?.type, model.api?.description, model.architecture?.decision].filter(Boolean).join("\n"),
    operations: model.operations || [],
    existingArtifacts: []
  });

  const implementationPass = verification.ready && audit.ready && connectors.ready;
  const designPass = governance.valid && contract.valid && policies.valid && Boolean(model.requirement || (model.requirements || []).length);
  const deploymentPass = deployment.valid && configuration.valid && compatibility.valid;

  const stages = {
    requirements: stage(
      designPass ? "pass" : "action-required",
      {
        requirementModel: Boolean(model.requirement || (model.requirements || []).length),
        apiGovernance: governance.valid,
        contract: contract.valid,
        policies: policies.valid
      },
      "Requirements, API contract and operation policies are evaluated using the existing validation engines."
    ),
    architecture: stage(
      architecture && Array.isArray(architecture.layers) && architecture.layers.length ? "pass" : "action-required",
      { inferred: Boolean(architecture), confidence: architecture?.confidence || "unknown", layers: architecture?.layers?.map(x => x.name) || [] },
      "Architecture is evidence-based; MuleForge does not invent API-led layers that are not supported by the supplied model."
    ),
    implementation: stage(
      implementationPass ? "pass" : "action-required",
      { verification: verification.ready, qualityAudit: audit.ready, connectors: connectors.ready },
      "Existing verification, quality and connector gates are aggregated rather than reimplemented."
    ),
    deployment: stage(
      deploymentPass ? "pass" : "action-required",
      { deployment: deployment.valid, configuration: configuration.valid, compatibility: compatibility.valid },
      "Deployment readiness means configuration and target compatibility are valid; it does not claim access to Anypoint Platform."
    ),
    runtime: stage(
      "not-verified",
      { liveProbeExecuted: false },
      "A live Mule runtime probe requires an authorized environment. Use muleforge runtime-test [directory] --start --url <url> to perform it."
    ),
    handoff: stage(
      implementationPass && designPass ? "pass" : "action-required",
      { traceability: fs.existsSync(path.join(root, "muleforge-traceability.json")), postman: fs.existsSync(path.join(root, "postman")), deploymentArtifacts: fs.existsSync(path.join(root, ".github", "workflows")) },
      "Developer handoff reuses generated traceability, Postman and deployment artifacts."
    )
  };

  const actionRequired = Object.entries(stages).filter(([, s]) => s.status === "action-required").map(([name]) => name);
  const report = {
    version: "1.0",
    generatedBy: "MuleForge",
    mode: "unified-engineering-readiness",
    project: model.project || {},
    architecture,
    workload,
    stages,\n    engineeringEvidence,
    existingGates: {
      governance,
      contract,
      configuration,
      deployment,
      policies,
      connectors,
      verification,
      qualityAudit: { ready: audit.ready, score: audit.score },
      compatibility
    },
    summary: {
      status: actionRequired.length ? "action-required" : "ready-for-authorized-deployment",
      actionRequired,
      runtimeStatus: "not-verified",
      note: "Ready means MuleForge's local engineering gates passed. It does not grant Anypoint permissions or prove production behavior without a live runtime verification."
    }
  };
  return report;
}

function writeReadiness(configFile = "muleforge.yaml", directory = null) {
  const report = buildReadiness(configFile, directory);
  const root = path.resolve(directory || path.dirname(path.resolve(configFile)));
  fs.writeFileSync(path.join(root, "muleforge-readiness.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  const rows = Object.entries(report.stages).map(([name, value]) =>
    "| " + name + " | " + value.status + " | " + (value.detail || "").replace(/\|/g, "\\|") + " |"
  );
  const md = [
    "# MuleForge Engineering Readiness",
    "",
    "This report aggregates existing MuleForge gates into one developer-facing lifecycle view. It does not replace those gates.",
    "",
    "## Overall",
    "",
    "- **Status:** " + report.summary.status,
    "- **Runtime:** not verified",
    "",
    "## Lifecycle",
    "",
    "| Stage | Status | Detail |",
    "|---|---|---|",
    rows.join("\n"),
    "",
    "## Architecture",
    "",
    "Layers: " + (report.architecture?.layers || []).map(x => x.name).join(" → ") + "",
    "",
    "Confidence: **" + (report.architecture?.confidence || "unknown") + "**",
    "",
    report.architecture?.decision || "",
    "",
    "## Developer actions",
    "",
    report.summary.actionRequired.length
      ? report.summary.actionRequired.map(x => "- Resolve the **" + x + "** stage using its existing MuleForge gate.").join("\n")
      : "- No local engineering gate requires action.",
    "",
    "## Important boundary",
    "",
    "A local readiness pass does not prove Anypoint Platform permissions, external connectivity, credentials, or production business behavior. Run the authorized runtime test before treating the deployment as live-verified.",
    ""
  ].join("\n");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "13-engineering-readiness.md"), md, "utf8");
  return report;
}

module.exports = { buildReadiness, writeReadiness };
