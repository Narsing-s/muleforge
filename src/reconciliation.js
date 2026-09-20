const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { importProject } = require("./import-project");

function readModel(file) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error("MuleForge model not found: " + file);
  return YAML.parse(fs.readFileSync(full, "utf8")) || {};
}

function operationKey(op = {}) {
  return String(op.method || "GET").toUpperCase() + " " + String(op.path || "/");
}

function normalizeConnector(value) {
  return String(value || "http").toLowerCase().replace(/_/g, "-");
}

function reconcileProject(model = {}, root = ".") {
  const imported = importProject(root);
  const desired = Array.isArray(model.operations) ? model.operations : [];
  const existing = Array.isArray(imported.operations) ? imported.operations : [];
  const existingByKey = new Map(existing.map(op => [operationKey(op), op]));
  const desiredByKey = new Map(desired.map(op => [operationKey(op), op]));

  const missing = desired.filter(op => !existingByKey.has(operationKey(op))).map(op => ({
    operation: operationKey(op),
    connector: normalizeConnector(op.connector),
    status: "missing",
    action: "implement"
  }));

  const implemented = desired.filter(op => existingByKey.has(operationKey(op))).map(op => {
    const found = existingByKey.get(operationKey(op));
    const expectedConnector = normalizeConnector(op.connector);
    const actualConnector = normalizeConnector(found.connector);
    return {
      operation: operationKey(op),
      connector: actualConnector,
      status: expectedConnector === actualConnector ? "implemented" : "connector-drift",
      expectedConnector,
      actualConnector,
      action: expectedConnector === actualConnector ? "review" : "reconcile"
    };
  });

  const extra = existing.filter(op => !desiredByKey.has(operationKey(op))).map(op => ({
    operation: operationKey(op),
    connector: normalizeConnector(op.connector),
    status: "extra-existing-operation",
    action: "review"
  }));

  const expectedAssets = {
    ramls: Number(imported.inventory?.raml || 0),
    muleXml: Number(imported.inventory?.muleXml || 0),
    dataWeave: Number(imported.inventory?.dataWeave || 0),
    munit: Number(imported.inventory?.munit || 0),
    pom: Boolean(imported.inventory?.pom)
  };

  const report = {
    version: "1.0",
    generatedBy: "MuleForge",
    mode: "requirement-to-existing-project-reconciliation",
    sourceOfTruth: "muleforge.yaml",
    project: {
      requirements: model.project?.name || model.project?.artifactId || "unknown",
      existingRepository: path.basename(path.resolve(root))
    },
    summary: {
      requiredOperations: desired.length,
      existingOperations: existing.length,
      implemented: implemented.filter(x => x.status === "implemented").length,
      missing: missing.length,
      connectorDrift: implemented.filter(x => x.status === "connector-drift").length,
      extraExistingOperations: extra.length,
      coreAssets: expectedAssets
    },
    operations: { implemented, missing, extra },
    inventory: imported.inventory,
    semantics: imported.semantics,
    preservation: {
      sourceRepositoryUntouched: true,
      generatedFiles: ["muleforge-reconciliation.json", "docs/12-reconciliation.md"],
      note: "Reconciliation reports reference existing assets; they do not copy or regenerate them."
    }
  };
  return report;
}

function writeReconciliation(modelFile = "muleforge.yaml", root = ".") {
  const model = readModel(modelFile);
  const report = reconcileProject(model, root);
  const base = path.resolve(root);
  fs.writeFileSync(path.join(base, "muleforge-reconciliation.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  const rows = [];
  for (const item of report.operations.implemented) rows.push("| " + item.operation + " | " + item.connector + " | " + item.status + " | " + item.action + " |");
  for (const item of report.operations.missing) rows.push("| " + item.operation + " | " + item.connector + " | missing | implement |");
  for (const item of report.operations.extra) rows.push("| " + item.operation + " | " + item.connector + " | extra-existing-operation | review |");
  const md = [
    "# Existing Project Reconciliation",
    "",
    "MuleForge compares the confirmed project model with an existing Mule repository without copying or regenerating existing assets.",
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|---|---:|",
    "| Required operations | " + report.summary.requiredOperations + " |",
    "| Existing operations | " + report.summary.existingOperations + " |",
    "| Implemented | " + report.summary.implemented + " |",
    "| Missing | " + report.summary.missing + " |",
    "| Connector drift | " + report.summary.connectorDrift + " |",
    "| Extra existing operations | " + report.summary.extraExistingOperations + " |",
    "",
    "## Operation reconciliation",
    "",
    "| Operation | Connector | Status | Action |",
    "|---|---|---|---|",
    rows.join("\n") || "| — | — | No operations | — |",
    "",
    "## Existing repository inventory",
    "",
    JSON.stringify(report.inventory, null, 2),
    "",
    "## Preservation",
    "",
    "- Existing source assets are not overwritten.",
    "- Existing project data is referenced rather than duplicated.",
    "- Missing and drifted items become explicit developer work.",
    ""
  ].join("\n");
  fs.mkdirSync(path.join(base, "docs"), { recursive: true });
  fs.writeFileSync(path.join(base, "docs", "12-reconciliation.md"), md, "utf8");
  return report;
}

module.exports = { reconcileProject, writeReconciliation };
