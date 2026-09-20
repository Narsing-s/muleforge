const fs = require("node:fs");
const path = require("node:path");

/**
 * Workload-neutral engineering layer.
 *
 * This deliberately does not generate a second project model. It classifies
 * evidence already present in the requirement model or imported repository and
 * produces a plan consumed by the existing generators/validators.
 */
const TYPES = Object.freeze({
  API: "api",
  EVENT: "event",
  SCHEDULED: "scheduled",
  FILE: "file",
  BATCH: "batch",
  SOAP: "soap",
  GRAPHQL: "graphql",
  INTEGRATION: "integration",
  UNKNOWN: "unknown"
});

const CONNECTOR_HINTS = {
  "anypoint-mq": TYPES.EVENT,
  "ibm-mq": TYPES.EVENT,
  jms: TYPES.EVENT,
  kafka: TYPES.EVENT,
  sftp: TYPES.FILE,
  file: TYPES.FILE,
  ftp: TYPES.FILE,
  "batch-job": TYPES.BATCH,
  batch: TYPES.BATCH,
  scheduler: TYPES.SCHEDULED,
  "scheduler-trigger": TYPES.SCHEDULED
};

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function evidence(source, signal, detail) {
  return { source, signal, detail };
}

function classifyWorkload(input = {}) {
  const model = input.model || input;
  const imported = input.imported || null;
  const text = [
    model.requirement,
    model.description,
    model.api?.description,
    model.api?.type,
    model.api?.specification,
    ...(Array.isArray(model.requirements) ? model.requirements.map(x => x.text || x.description || x) : []),
    textOf(model.events || model.triggers || []),
    textOf(model.connectors || [])
  ].join("\n").toLowerCase();

  const operations = Array.isArray(model.operations) ? model.operations : [];
  const connectors = [
    ...(Array.isArray(model.connectors) ? model.connectors : []),
    ...operations.map(x => x.connector),
    ...(imported?.semantics?.connectors || []),
    ...(imported?.connectors || [])
  ].filter(Boolean).map(normalize);

  const ev = [];
  const apiEvidence = operations.some(op => op.path && op.method)
    ? evidence("model.operations", "http-operation", "HTTP method/path operations are explicitly declared.")
    : null;
  if (apiEvidence) ev.push(apiEvidence);

  const apiWords = /\b(rest|http|https|api|raml|openapi|endpoint|resource|apikit)\b/.test(text);
  if (apiWords) ev.push(evidence("requirement/model", "api-language", "Requirement or model contains API/HTTP contract terminology."));

  const eventConnectors = connectors.filter(c => CONNECTOR_HINTS[c] === TYPES.EVENT);
  if (eventConnectors.length) ev.push(evidence("connectors", "messaging", "Messaging connector detected: " + [...new Set(eventConnectors)].join(", ")));

  const fileConnectors = connectors.filter(c => CONNECTOR_HINTS[c] === TYPES.FILE);
  if (fileConnectors.length) ev.push(evidence("connectors", "file-transfer", "File/SFTP connector detected: " + [...new Set(fileConnectors)].join(", ")));

  const scheduled = /\b(schedule|scheduled|cron|every\s+(day|hour|night|week)|daily|hourly|timer|poll)\b/.test(text)
    || connectors.includes("scheduler");
  if (scheduled) ev.push(evidence("requirement/model", "scheduled-trigger", "Schedule/timer language or scheduler trigger detected."));

  const batch = /\b(batch|batch job|large volume|chunk|partition|bulk processing)\b/.test(text)
    || connectors.includes("batch") || connectors.includes("batch-job");
  if (batch) ev.push(evidence("requirement/model", "batch-processing", "Batch-processing language or batch capability detected."));

  const soap = /\b(soap|wsdl|web service)\b/.test(text) || Boolean(model.wsdl);
  if (soap) ev.push(evidence("requirement/model", "soap-wsdl", "SOAP/WSDL evidence detected."));

  const graphql = /\bgraphql\b/.test(text) || Boolean(model.graphql);
  if (graphql) ev.push(evidence("requirement/model", "graphql", "GraphQL evidence detected."));

  let type = TYPES.UNKNOWN;
  // Explicit contract evidence wins over generic integration terminology.
  if (soap) type = TYPES.SOAP;
  else if (graphql) type = TYPES.GRAPHQL;
  else if (apiEvidence || (apiWords && !eventConnectors.length && !fileConnectors.length && !scheduled && !batch)) type = TYPES.API;
  else if (eventConnectors.length) type = TYPES.EVENT;
  else if (fileConnectors.length) type = TYPES.FILE;
  else if (batch) type = TYPES.BATCH;
  else if (scheduled) type = TYPES.SCHEDULED;
  else if (operations.length || connectors.length) type = TYPES.INTEGRATION;

  const confirmed = Boolean(model.workload?.type && Object.values(TYPES).includes(normalize(model.workload.type)));
  if (confirmed) type = normalize(model.workload.type);

  const apiContractRequired = [TYPES.API, TYPES.SOAP, TYPES.GRAPHQL].includes(type);
  const confidence = confirmed ? "confirmed" : ev.length >= 2 ? "high" : ev.length === 1 ? "medium" : "low";

  return {
    version: "1.0",
    type,
    confidence,
    status: type === TYPES.UNKNOWN ? "unknown" : confirmed ? "confirmed" : "inferred",
    apiContractRequired,
    ramlRequired: type === TYPES.API && String(model.api?.specification || "RAML").toUpperCase() === "RAML",
    evidence: ev,
    decisions: {
      generateApiContract: apiContractRequired,
      generateRaml: type === TYPES.API && String(model.api?.specification || "RAML").toUpperCase() === "RAML",
      generateEventRuntime: type === TYPES.EVENT || (Array.isArray(model.events) && model.events.length > 0),
      generateDeployment: Boolean(model.deployment),
      generateTests: model.testing?.munit !== false
    },
    assumptions: type === TYPES.UNKNOWN
      ? ["Workload type cannot be determined from the supplied evidence; developer confirmation is required before workload-specific generation."]
      : [],
    developerActionRequired: type === TYPES.UNKNOWN
  };
}

function buildEngineeringPlan(model = {}, options = {}) {
  const workload = classifyWorkload({ model, imported: options.imported });
  const operations = Array.isArray(model.operations) ? model.operations : [];
  const requirements = Array.isArray(model.requirements)
    ? model.requirements.length
    : String(model.requirement || "").trim() ? 1 : 0;

  const existing = options.imported ? {
    files: Number(options.imported.inventory?.files || 0),
    muleXml: Number(options.imported.inventory?.muleXml || 0),
    raml: Number(options.imported.inventory?.raml || 0),
    dataWeave: Number(options.imported.inventory?.dataWeave || 0),
    munit: Number(options.imported.inventory?.munit || 0),
    pom: Boolean(options.imported.inventory?.pom)
  } : null;

  return {
    version: "1.0",
    generatedBy: "MuleForge",
    mode: options.imported ? "existing-repository-engineering" : "requirement-engineering",
    input: options.imported ? "existing-mule-repository" : "requirements-or-project-model",
    project: model.project || {},
    workload,
    pipeline: [
      "evidence",
      "workload-classification",
      "architecture-decision",
      "api-contract-or-integration-design",
      "implementation",
      "data-transformation",
      "error-and-reliability",
      "munit",
      "contract-and-quality-gates",
      "traceability",
      "package",
      "deployment-preflight",
      "deployment",
      "runtime-verification",
      "developer-handoff"
    ],
    scope: {
      requirements,
      operations: operations.length,
      connectors: Array.isArray(model.connectors) ? [...new Set(model.connectors.map(normalize).filter(Boolean))] : [],
      existing
    },
    ownership: {
      principle: "Preserve developer-owned and external assets; only regenerate MuleForge-owned artifacts.",
      classes: ["MULEFORGE_MANAGED", "SHARED", "DEVELOPER_MANAGED", "EXTERNAL"]
    },
    impact: {
      enabled: true,
      sourceOfTruth: "existing semantic model and traceability",
      note: "Changes should be evaluated against affected contract, flow, transformation, tests, CI/CD and deployment assets before regeneration."
    },
    gaps: workload.developerActionRequired ? workload.assumptions : [],
    endToEnd: {
      design: workload.type === TYPES.API ? "RAML/OAS as indicated by the model" : "workload-specific integration design",
      implementation: "existing MuleForge generators and imported repository evidence",
      testing: "existing MUnit/test generators",
      delivery: "existing CI/CD and deployment artifacts",
      runtime: "requires authorized runtime verification"
    }
  };
}

function explainImportedProject(imported = {}) {
  const model = imported.model || imported;
  const plan = buildEngineeringPlan(model, { imported });
  const flows = Array.isArray(imported.semantics?.flows) ? imported.semantics.flows : [];
  return {
    ...plan,
    existingProject: {
      architecture: imported.architecture || null,
      inventory: imported.inventory || {},
      semantics: imported.semantics || {},
      flowCount: flows.length,
      flows: flows.map(flow => ({
        name: flow.name || flow.id,
        trigger: flow.trigger || flow.source || null,
        flowRefs: flow.flowRefs || [],
        connectors: flow.connectors || [],
        transforms: flow.transforms || 0,
        errorHandlers: flow.errorHandlers || 0
      }))
    }
  };
}

function writeEngineeringPlan(root, plan, filename = "muleforge-engineering-plan.json") {
  const base = path.resolve(root);
  fs.writeFileSync(path.join(base, filename), JSON.stringify(plan, null, 2) + "\n", "utf8");
  fs.mkdirSync(path.join(base, "docs"), { recursive: true });
  const workload = plan.workload || {};
  const md = [
    "# MuleForge Engineering Plan",
    "",
    "This plan is derived from the existing MuleForge model/import evidence. It does not create a second project model.",
    "",
    "## Workload",
    "",
    "- Type: **" + workload.type + "**",
    "- Evidence status: **" + workload.status + "**",
    "- Confidence: **" + workload.confidence + "**",
    "- API contract required: **" + workload.apiContractRequired + "**",
    "- RAML required: **" + workload.ramlRequired + "**",
    "",
    "## Evidence",
    "",
    ...(workload.evidence || []).map(x => "- " + x.source + " → **" + x.signal + "** — " + x.detail),
    "",
    "## Engineering lifecycle",
    "",
    plan.pipeline.map((x, i) => (i + 1) + ". " + x),
    "",
    "## Existing repository",
    "",
    plan.existingProject
      ? JSON.stringify(plan.existingProject.inventory || {}, null, 2)
      : "No existing repository was supplied.",
    "",
    "## Developer-owned data",
    "",
    "MuleForge must preserve developer-owned and external assets. Regeneration is limited to artifacts recorded as MuleForge-managed.",
    "",
    "## Unknowns",
    "",
    ...(workload.assumptions || []).map(x => "- " + x),
    workload.assumptions?.length ? "" : "- None identified by workload classification.",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(base, "docs", "14-engineering-plan.md"), md, "utf8");
  return { json: path.join(base, filename), documentation: path.join(base, "docs", "14-engineering-plan.md"), plan };
}

module.exports = {
  TYPES,
  classifyWorkload,
  buildEngineeringPlan,
  explainImportedProject,
  writeEngineeringPlan
};
