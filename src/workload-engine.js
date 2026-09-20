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
  ].join("
").toLowerCase();

  const operations = Array.isArray(model.operations) ? model.operations : [];
  const connectors = [
    ...(Array.isArray(model.connectors) ? model.connectors : []),
    ...operations.map(x => x.connector),
    ...(imported?.semantics?.connectors || []),
    ...(imported?.connectors || [])
  ].filter(Boolean).map(normalize);

  const ev = [];
  const apiEvidence = operations.some(op => op.path && op.method) || /^(apikit|api-kit)$/i.test(String(model.api?.implementation || model.api?.router || ""))
    ? evidence("model.operations", "http-operation", "HTTP method/path operations are explicitly declared.")
    : null;
  if (apiEvidence) ev.push(apiEvidence);

  const apiWords = /\b(rest|http|https|api|raml|openapi|endpoint|resource|apikit)\b/.test(text);
  if (apiWords) ev.push(evidence("requirement/model", "api-language", "Requirement or model contains API/HTTP contract terminology."));

  const importedTriggers = imported?.semantics?.triggers || imported?.triggers || [];
  const importedRouters = imported?.semantics?.routers || imported?.routers || [];
  const hasSchedulerTrigger = importedTriggers.some(x => /scheduler|timer/i.test(String(x.type || "")));
  const hasBatchTrigger = importedTriggers.some(x => /batch/i.test(String(x.type || "")));
  const hasHttpRouter = importedRouters.some(x => /apikit:router/i.test(String(x.type || "")));
  const eventConnectors = connectors.filter(c => CONNECTOR_HINTS[c] === TYPES.EVENT);
  if (hasHttpRouter) ev.push(evidence("repository.router", "apikit-router", "APIKit router evidence detected in the imported Mule source."));
  if (eventConnectors.length) ev.push(evidence("connectors", "messaging", "Messaging connector detected: " + [...new Set(eventConnectors)].join(", ")));

  const fileConnectors = connectors.filter(c => CONNECTOR_HINTS[c] === TYPES.FILE);
  if (fileConnectors.length) ev.push(evidence("connectors", "file-transfer", "File/SFTP connector detected: " + [...new Set(fileConnectors)].join(", ")));

  const scheduled = /\b(schedule|scheduled|cron|every\s+(day|hour|night|week)|daily|hourly|timer|poll)\b/.test(text)
    || connectors.includes("scheduler") || hasSchedulerTrigger;
  if (scheduled) ev.push(evidence("requirement/model", "scheduled-trigger", "Schedule/timer language or scheduler trigger detected."));

  const batch = /\b(batch|batch job|large volume|chunk|partition|bulk processing)\b/.test(text)
    || connectors.includes("batch") || connectors.includes("batch-job") || hasBatchTrigger;
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
  else if (batch) type = TYPES.BATCH;
  else if (eventConnectors.length) type = TYPES.EVENT;
  else if (fileConnectors.length) type = TYPES.FILE;
  else if (scheduled) type = TYPES.SCHEDULED;
  else if (operations.length || connectors.length) type = TYPES.INTEGRATION;

  const confirmed = Boolean(model.workload?.type && Object.values(TYPES).includes(normalize(model.workload.type)));
  if (confirmed) type = normalize(model.workload.type);

  const apiContractRequired = [TYPES.API, TYPES.SOAP, TYPES.GRAPHQL].includes(type);
  const trigger = scheduled ? "scheduler" : eventConnectors.length ? "messaging" : fileConnectors.length ? "file" : apiEvidence ? "http" : soap ? "soap" : graphql ? "graphql" : "unknown";
  const transports = [...new Set([
    ...eventConnectors.map(c => c),
    ...fileConnectors.map(c => c),
    ...connectors.filter(c => !CONNECTOR_HINTS[c] && c)
  ])];
  const deploymentTarget = normalize(model.deployment?.target || model.deployment?.runtime || "");
  const deploymentTargets = ["cloudhub", "cloudhub-2", "cloudhub2", "runtime-fabric", "rtf", "hybrid", "standalone"].filter(x => deploymentTarget === x);

  const confidence = confirmed ? "confirmed" : ev.length >= 2 ? "high" : ev.length === 1 ? "medium" : "low";

  return {
    version: "1.0",
    type,
    confidence,
    status: type === TYPES.UNKNOWN ? "unknown" : confirmed ? "confirmed" : "inferred",
    apiContractRequired,
    ramlRequired: type === TYPES.API && String(model.api?.specification || "RAML").toUpperCase() === "RAML",
    evidence: ev,
    trigger,
    transports,
    deploymentTarget: deploymentTarget || null,
    capabilities: [...new Set([
      apiContractRequired ? "api-contract" : null,
      eventConnectors.length ? "messaging" : null,
      fileConnectors.length ? "file-transfer" : null,
      scheduled ? "scheduler" : null,
      batch ? "batch-processing" : null,
      soap ? "soap" : null,
      graphql ? "graphql" : null
    ].filter(Boolean))],
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

const LIFECYCLE = Object.freeze([
  "DESIGNED","APPROVED","GENERATED","VERIFIED","TESTED","PACKAGED",
  "DEPLOYMENT-READY","DEV-DEPLOYED","DEV-VERIFIED","QA-APPROVED",
  "QA-DEPLOYED","QA-VERIFIED","PROD-APPROVED","PROD-DEPLOYED","PROD-VERIFIED"
]);

function certaintyState(value) {
  if (value === "confirmed" || value === "inferred" || value === "unknown" || value === "conflicting" || value === "not-applicable") return value;
  return value ? "inferred" : "unknown";
}

function buildLifecycleState() {
  return {
    states: [...LIFECYCLE],
    current: "DESIGNED",
    transitions: LIFECYCLE.slice(1).map((to, i) => ({
      from: LIFECYCLE[i],
      to,
      requires: i === 0 ? "explicit developer approval" : "evidence from the preceding gate"
    })),
    rule: "A later lifecycle state must not be claimed without evidence for the preceding state."
  };
}

function buildDeveloperHandoff(plan, imported) {
  const workload = plan.workload || {};
  return {
    certainty: {
      workload: certaintyState(workload.status),
      architecture: certaintyState(imported?.architecture?.decision || null),
      deployment: workload.deploymentTarget ? "inferred" : "unknown"
    },
    artifacts: [
      "solution-design.md","architecture.md","implementation-map.md","flow-map.md",
      "configuration.md","connector-map.md","testing.md","deployment.md",
      "runtime-verification.md","traceability.md","known-gaps.md"
    ],
    remediation: {
      requiredFields: ["what","where","why","howToFix","affectedArtifacts"],
      rule: "Every failed gate should identify the affected engineering evidence and a concrete remediation path."
    },
    kt: imported ? "Project-specific onboarding/support material should be derived from imported flows, connectors, configurations, tests and deployment evidence." : "Developer onboarding material should be derived from the generated engineering evidence."
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
      matrix: buildChangeImpact(model, options.imported || {}),
      sourceOfTruth: "existing semantic model and traceability",
      note: "Changes should be evaluated against affected contract, flow, transformation, tests, CI/CD and deployment assets before regeneration."
    },
    coverage: buildCoverageMatrix(model, options.imported || {}),
    dependencies: buildDependencyEvidence(options.imported || {}),
    runtimeEvidence: buildRuntimeEvidence(model, options.imported || {}),
    gaps: workload.developerActionRequired ? workload.assumptions : [],
    artifactPlan: {
      contract: workload.apiContractRequired ? (workload.ramlRequired ? ["RAML", "Mule implementation", "MUnit", "Postman"] : ["API contract", "Mule implementation", "MUnit"]) : ["workload-specific Mule implementation", "MUnit"],
      integration: ["DataWeave", "connector configuration", "error/retry handling"],
      delivery: ["Maven package", "CI/CD", "deployment preflight"],
      runtime: ["deployment verification", "smoke verification", "runtime evidence"]
    },
    deployment: {
      requestedTarget: workload.deploymentTarget,
      recognized: ["cloudhub", "cloudhub-2", "cloudhub2", "runtime-fabric", "rtf", "hybrid", "standalone"].includes(workload.deploymentTarget),
      supportedTargets: ["cloudhub", "cloudhub-2", "runtime-fabric", "hybrid"],
      note: "Use the existing deployment validators and target-specific generators; credentials remain external."
    },
    lifecycle: buildLifecycleState(),
    certainty: {
      requirement: requirements ? "confirmed-or-inferred" : "unknown",
      workload: certaintyState(workload.status),
      deployment: workload.deploymentTarget ? "inferred" : "unknown"
    },
    developerHandoff: {
      artifacts: ["solution-design.md","architecture.md","implementation-map.md","flow-map.md","configuration.md","connector-map.md","testing.md","deployment.md","runtime-verification.md","traceability.md","known-gaps.md"],
      remediation: ["what","where","why","howToFix","affectedArtifacts"],
      onboarding: options.imported ? "derive from actual repository evidence" : "derive from generated engineering evidence"
    },
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
  plan.developerHandoff = buildDeveloperHandoff(plan, imported);
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

function explainOperation(imported = {}, selector = "") {
  const target = String(selector || "").trim().toLowerCase();
  const operations = Array.isArray(imported.operations) ? imported.operations : [];
  const matches = operations.filter(op => {
    const key = [op.method, op.path].filter(Boolean).join(":").toLowerCase();
    return !target || key === target || key.includes(target);
  });
  return {
    selector,
    found: matches.length > 0,
    operations: matches.map(op => {
      const flow = (imported.semantics?.flows || []).find(f => f.source === op.source && String(f.name || "").toLowerCase() === String(op.name || "").toLowerCase());
      return {
        operation: [op.method, op.path].filter(Boolean).join(" "),
        source: op.source || null,
        connector: op.connector || null,
        action: op.action || null,
        flow: flow?.name || op.name || null,
        flowRefs: imported.semantics?.flowRefs || [],
        transformations: imported.semantics?.transformCount || 0,
        errorHandling: imported.semantics?.errorHandlers || [],
        testAssets: imported.inventory?.munit || 0,
        contractAssets: imported.inventory?.raml || 0,
        certainty: "confirmed"
      };
    }),
    remediation: matches.length ? null : {
      what: "Operation was not found in imported evidence.",
      where: selector,
      why: "No matching HTTP/connector operation was reconstructed.",
      howToFix: "Check the source Mule XML, listener configuration, generated/subflow references and importer coverage.",
      affectedArtifacts: ["implementation", "tests", "traceability", "deployment"]
    }
  };
}

function writeEngineeringPlan(root, plan, filename = "muleforge-engineering-plan.json") {
  const base = path.resolve(root);
  fs.writeFileSync(path.join(base, filename), JSON.stringify(plan, null, 2) + "
", "utf8");
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
    "## Lifecycle gate",
    "",
    "- Current state: **" + (plan.lifecycle?.current || "unknown") + "**",
    "- Allowed states: " + (plan.lifecycle?.states || []).join(" → "),
    "- Rule: " + (plan.lifecycle?.rule || "Evidence is required for each transition."),
    "",
    "## Certainty",
    "",
    "- Requirement: **" + (plan.certainty?.requirement || "unknown") + "**",
    "- Workload: **" + (plan.certainty?.workload || "unknown") + "**",
    "- Deployment: **" + (plan.certainty?.deployment || "unknown") + "**",
    "",
    "## Developer handoff",
    "",
    ...(plan.developerHandoff?.artifacts || []).map(x => "- " + x),
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
  ].join("
");
  fs.writeFileSync(path.join(base, "docs", "14-engineering-plan.md"), md, "utf8");
  return { json: path.join(base, filename), documentation: path.join(base, "docs", "14-engineering-plan.md"), plan };
}

function buildChangeImpact(model = {}, imported = {}) {
  const operations = Array.isArray(model.operations) ? model.operations : (imported.operations || []);
  return operations.map(op => ({
    operation: [op.method, op.path].filter(Boolean).join(" ") || op.name || "unknown",
    source: op.source || null,
    affectedArtifacts: ["implementation","dataweave","error-handling","munit","traceability","ci-cd","deployment"],
    reviewBeforeRegeneration: true,
    evidence: op.source ? "source-backed" : "model-backed"
  }));
}

function buildCoverageMatrix(model = {}, imported = {}) {
  const operations = Array.isArray(model.operations) ? model.operations : (imported.operations || []);
  const inv = imported.inventory || {};
  return operations.map(op => ({
    operation: [op.method, op.path].filter(Boolean).join(" ") || op.name || "unknown",
    implementation: Boolean(op.source),
    contract: Number(inv.raml || 0) > 0 ? "available" : "unknown",
    dataWeave: Number(inv.dataWeave || 0) > 0 ? "available" : "unknown",
    munit: Number(inv.munit || 0) > 0 ? "available" : "unknown",
    deployment: "requires existing deployment/readiness gates",
    runtime: "not-verified"
  }));
}

function buildDependencyEvidence(imported = {}) {
  return {
    maven: imported.dependencyEvidence || [],
    exchange: imported.exchangeDependencies || [],
    rule: "Dependencies are evidence only; MuleForge does not copy, mutate, or silently upgrade external assets."
  };
}

function buildRuntimeEvidence(model = {}, imported = {}) {
  return {
    status: "not-verified",
    deploymentTarget: model.deployment?.target || null,
    artifactManifestRequired: true,
    artifactSha256Required: true,
    deployed: "unknown",
    runtimeVerified: false,
    evidence: imported.deploymentEvidence || [],
    rule: "Deployment is not runtime verification; runtime evidence requires an authorized live probe."
  };
}

module.exports = {
  TYPES,
  classifyWorkload,
  buildEngineeringPlan,
  explainImportedProject,
  writeEngineeringPlan,
  LIFECYCLE,
  certaintyState,
  buildLifecycleState,
  buildDeveloperHandoff,
  explainOperation
};
