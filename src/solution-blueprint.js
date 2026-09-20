const { inferApiLedArchitecture } = require("./architecture");
const { buildIntegrationIR, validateIntegrationIR } = require("./semantic-ir");
const { classifyWorkload, buildEngineeringPlan } = require("./workload-engine");

function text(value) {
  return String(value || "").trim();
}

function requirementItems(model) {
  if (Array.isArray(model.requirements) && model.requirements.length) {
    return model.requirements.map((item, index) => ({
      id: item.id || "REQ-" + String(index + 1).padStart(3, "0"),
      text: text(item.text || item.requirement || item.description),
      source: item.source || null
    })).filter(item => item.text);
  }
  if (text(model.requirement)) return [{ id: "REQ-001", text: text(model.requirement), source: "confirmed-model" }];
  const hasProjectModel = Boolean(
    model.project &&
    (Array.isArray(model.operations) && model.operations.length ||
      Array.isArray(model.connectors) && model.connectors.length ||
      model.api)
  );
  return hasProjectModel
    ? [{ id: "MODEL-001", text: "Existing project model supplied; generate from the confirmed project configuration.", source: "project-model" }]
    : [];
}

function securitySignals(model) {
  const source = [
    model.requirement,
    ...(Array.isArray(model.requirements) ? model.requirements.map(x => x.text || x.description || "") : []),
    JSON.stringify(model.api || {}),
    JSON.stringify(model.connectivity || [])
  ].join("\n").toLowerCase();
  const schemes = [];
  if (/oauth\s*2|oauth2/.test(source)) schemes.push("oauth2");
  if (/client[ -]?credentials?/.test(source)) schemes.push("client-credentials");
  if (/jwt|json web token/.test(source)) schemes.push("jwt");
  if (/openid|oidc/.test(source)) schemes.push("oidc");
  if (/basic auth|basic authentication/.test(source)) schemes.push("basic");
  if (/api[ -]?key/.test(source)) schemes.push("api-key");
  return {
    required: schemes.length > 0 || /authentication|authorization|security|tls|https|encrypt|throttl|rate limit|sla|ip allow|ip restrict/i.test(source),
    schemes: [...new Set(schemes)],
    evidence: [
      /authentication|oauth|jwt|openid|api[ -]?key|basic auth/i.test(source) ? "authentication evidence detected" : null,
      /authorization|role|permission|scope/i.test(source) ? "authorization evidence detected" : null,
      /tls|https|encrypt/i.test(source) ? "transport/encryption evidence detected" : null,
      /rate limit|throttl|quota|sla/i.test(source) ? "traffic policy evidence detected" : null
    ].filter(Boolean),
    rule: "Credentials and secrets are never generated from requirement text; only non-secret security design evidence is recorded."
  };
}

function nfrSignals(model) {
  const source = [
    model.requirement,
    ...(Array.isArray(model.requirements) ? model.requirements.map(x => x.text || "") : [])
  ].join("\n").toLowerCase();
  const categories = [];
  if (/performance|latency|response time|throughput|requests per second|rps/.test(source)) categories.push("performance");
  if (/availability|uptime|resilien|high availability|disaster recovery|recovery time/.test(source)) categories.push("availability");
  if (/timeout|retry|circuit breaker|dead[- ]letter|dlq|idempot/.test(source)) categories.push("reliability");
  if (/audit|logging|monitor|observability|trace|correlation id|metrics|alert/.test(source)) categories.push("observability");
  if (/retention|pii|personal data|sensitive|compliance|gdpr|hipaa|pci/.test(source)) categories.push("data-governance");
  if (/scale|scalability|concurrent|volume|large volume/.test(source)) categories.push("scalability");
  return [...new Set(categories)];
}

function requirementTexts(model) {
  return [
    model.requirement,
    ...(Array.isArray(model.requirements) ? model.requirements.map(x => x.text || x.description || x.requirement || "") : [])
  ].filter(Boolean).join("\\n");
}

function operationRules(operations) {
  return operations.map((op, index) => {
    const name = op.name || op.operation || `${op.method || "operation"} ${op.path || index + 1}`;
    return {
      id: op.id || `OP-${String(index + 1).padStart(3, "0")}`,
      name,
      method: op.method || null,
      path: op.path || null,
      validation: Array.isArray(op.validation) ? op.validation : [],
      errors: Array.isArray(op.errors) ? op.errors : [],
      successStatus: op.successStatus || null,
      requestFields: Array.isArray(op.requestFields) ? op.requestFields : [],
      responseFields: Array.isArray(op.responseFields) ? op.responseFields : [],
      reliability: {
        retry: op.retry || null,
        timeout: op.timeout || null,
        idempotency: op.idempotency || false,
        transaction: op.transaction || false,
        pagination: op.pagination || null
      },
      security: op.security || null,
      connector: op.connector || null
    };
  });
}

function observabilitySignals(model) {
  const source = requirementTexts(model).toLowerCase();
  const explicit = model.observability && typeof model.observability === "object" ? model.observability : {};
  return {
    required: Boolean(Object.keys(explicit).length) || /observability|monitoring|metrics|logging|alert|correlation.?id|distributed trace|tracing/.test(source),
    requirements: Object.keys(explicit).length ? explicit : {
      correlationId: /correlation.?id|trace.?id|distributed trace|tracing/.test(source),
      metrics: /metrics|performance|latency|throughput/.test(source),
      logs: /logging|logs|audit/.test(source),
      alerts: /alert|notification|incident/.test(source)
    },
    source: Object.keys(explicit).length ? "explicit model" : "requirement evidence"
  };
}

function businessRules(model, operations) {
  const textRules = [];
  for (const item of Array.isArray(model.requirements) ? model.requirements : []) {
    if (item.businessRule || item.rule) textRules.push({ source: item.source || null, rule: text(item.businessRule || item.rule) });
  }
  return {
    operationRules: operationRules(operations),
    requirementRules: textRules.filter(x => x.rule),
    rule: "Business rules are evidence-backed; MuleForge must not invent domain decisions that are absent from the requirement/model."
  };
}

function projectTopology(model, architecture) {
  const source = requirementTexts(model).toLowerCase();
  const explicitMultiple = /separate (?:projects?|applications?)|independent (?:projects?|applications?)|multiple (?:mule )?(?:apps?|projects?)|deploy each (?:api|layer)|independently deployable/.test(source);
  const layers = Array.isArray(architecture?.layers) ? architecture.layers : [];
  return {
    mode: explicitMultiple ? "multi-project-required" : "single-project-default",
    explicit: explicitMultiple,
    logicalApiLayers: layers.map(layer => typeof layer === "string" ? layer : layer.name).filter(Boolean),
    rule: "API-led layers are logical architecture boundaries unless the requirement explicitly requires independently deployable projects.",
    generationBoundary: explicitMultiple
      ? "Generation must orchestrate one Mule project per explicitly independent application/API; do not flatten them into one application."
      : "Use the existing single-project generators unless independent deployment is explicitly required."
  };
}

function environmentPlan(model) {
  const configured = model.deployment?.promotionEnvironments || model.deployment?.environments;
  const environments = Array.isArray(configured) && configured.length
    ? configured.map(String)
    : ["dev", "qa", "uat", "prod"];
  return {
    environments: [...new Set(environments)],
    source: Array.isArray(configured) && configured.length ? "explicit model" : "MuleForge default promotion lifecycle",
    rule: "Environment-specific values remain externalized; secrets and credentials are never embedded in generated source."
  };
}

function architectureFor(model, workload) {
  const supplied = model.architecture;
  if (supplied && typeof supplied === "object") return supplied;
  return inferApiLedArchitecture({
    text: [model.requirement, model.api?.type, model.api?.description].filter(Boolean).join("\n"),
    operations: model.operations || [],
    existingArtifacts: model.existingArtifacts || []
  });
}

/**
 * The Solution Blueprint is a projection of the existing confirmed model.
 * It deliberately does not introduce a second generator/model or duplicate
 * artifact logic. Downstream generators continue to consume the canonical
 * MuleForge model.
 */
function buildSolutionBlueprint(model = {}) {
  const workload = classifyWorkload({ model });
  const architecture = architectureFor(model, workload);
  const ir = buildIntegrationIR(model);
  const irValidation = validateIntegrationIR(ir);
  const plan = buildEngineeringPlan(model);
  const requirements = requirementItems(model);
  const security = securitySignals(model);
  const nfr = nfrSignals(model);
  const explicitApiLed = /api[- ]led|experience api|process api|system api/i.test(
    [model.requirement, model.api?.description, model.architecture?.decision].filter(Boolean).join("\n")
  );
  const operations = Array.isArray(model.operations) ? model.operations : [];
  const connectors = Array.isArray(model.connectors) ? [...new Set(model.connectors.map(String))] : [];
  const rules = businessRules(model, operations);
  const observability = observabilitySignals(model);
  const topology = projectTopology(model, architecture);
  const environments = environmentPlan(model);

  return {
    version: "1.0",
    kind: "muleforge-solution-blueprint",
    sourceOfTruth: "confirmed MuleForge requirement/project model",
    project: model.project || {},
    requirement: {
      count: requirements.length,
      items: requirements,
      conflicts: Array.isArray(model.conflicts) ? model.conflicts : [],
      missingConfigurations: Array.isArray(model.missingConfigurations) ? model.missingConfigurations : []
    },
    workload,
    architecture: {
      ...architecture,
      apiLedExplicitlyRequested: explicitApiLed
    },
    integration: {
      operations,
      connectors,
      semanticIR: ir,
      semanticIRValid: irValidation.valid,
      semanticIRErrors: irValidation.errors
    },
    security,
    businessRules: rules,
    nonFunctionalRequirements: {
      categories: nfr,
      source: nfr.length ? "requirement evidence" : "no explicit NFR evidence found",
      requiredImplementation: nfr
    },
    observability,
    projectTopology: topology,
    delivery: {
      engineeringPlan: plan,
      contract: workload.apiContractRequired ? "required" : "not-applicable",
      tests: model.testing?.munit === false ? "explicitly-disabled" : "required",
      deployment: model.deployment || {},
      environments: environments.environments,
      environmentPlan: environments,
      release: {
        promotionPlan: Boolean(model.deployment),
        rollback: Boolean(model.deployment),
        runtimeVerification: "required before claiming live-verified"
      }
    },
    generationContract: {
      requirement: ["source evidence", "requirements", "conflicts", "missing decisions"],
      design: ["workload", "architecture", "business rules", "security", "NFRs", "connectivity"],
      implementation: ["Mule XML", "DataWeave", "connector configuration", "error/reliability handling"],
      validation: ["contract validation", "MUnit", "Postman", "traceability", "quality/security gates"],
      delivery: ["Maven", "CI/CD", "deployment configuration", "promotion/rollback metadata"],
      operations: ["runtime verification", "functional monitoring artifacts", "observability evidence"],
      rule: "A generated artifact is considered complete only when it is supported by the confirmed requirement model and passes the existing MuleForge verification gates."
    },
    artifactOwnership: {
      rule: "Reuse existing MuleForge generators and preserve developer-owned/external assets.",
      managedByExistingGenerators: [
        "API contract",
        "Mule implementation",
        "DataWeave",
        "MUnit",
        "Postman",
        "deployment artifacts",
        "traceability",
        "documentation",
        "CI/CD",
        "security/SBOM/provenance"
      ]
    }
  };
}

function validateSolutionBlueprint(model = {}, blueprint = buildSolutionBlueprint(model)) {
  const issues = [];
  if (!blueprint.requirement.count) issues.push({ severity: "critical", code: "BLUEPRINT_REQUIREMENT_MISSING", message: "No confirmed requirement was preserved." });
  if (blueprint.requirement.conflicts.length) issues.push({ severity: "critical", code: "BLUEPRINT_CONFLICTS", message: "Unresolved requirement conflicts remain." });
  if (blueprint.requirement.missingConfigurations.length) issues.push({ severity: "critical", code: "BLUEPRINT_CONNECTIVITY_GAPS", message: "Required non-secret connectivity decisions remain unresolved." });
  if (blueprint.workload.type === "unknown") issues.push({ severity: "critical", code: "BLUEPRINT_WORKLOAD_UNKNOWN", message: "Workload type cannot be determined from confirmed evidence." });
  if (!blueprint.integration.semanticIRValid) issues.push({ severity: "critical", code: "BLUEPRINT_IR_INVALID", message: blueprint.integration.semanticIRErrors.join("; ") });
  if (blueprint.workload.apiContractRequired && !blueprint.integration.operations.length) issues.push({ severity: "critical", code: "BLUEPRINT_OPERATIONS_MISSING", message: "The selected contract workload has no confirmed operations." });
  if (blueprint.architecture.apiLedExplicitlyRequested) {
    const layers = new Set(blueprint.architecture.layers || []);
    if (!layers.size) issues.push({ severity: "critical", code: "BLUEPRINT_API_LED_UNRESOLVED", message: "API-led connectivity was explicitly requested but no architecture layers were resolved." });
  }
  if (blueprint.projectTopology.mode === "multi-project-required") {
    issues.push({ severity: "critical", code: "BLUEPRINT_MULTI_PROJECT_ORCHESTRATION_REQUIRED", message: "The requirement explicitly requires independently deployable applications/projects; single-project generation must not flatten this topology." });
  }
  if (blueprint.security.required && !blueprint.security.schemes.length) {
    issues.push({ severity: "warning", code: "SECURITY_SCHEME_UNCONFIRMED", message: "Security evidence exists but no concrete authentication scheme was confirmed." });
  }
  if (!blueprint.nonFunctionalRequirements.categories.length) {
    issues.push({ severity: "warning", code: "NFR_UNCONFIRMED", message: "No explicit non-functional requirement categories were detected." });
  }
  if (blueprint.observability.required && !Object.keys(blueprint.observability.requirements || {}).some(key => blueprint.observability.requirements[key])) {
    issues.push({ severity: "warning", code: "OBSERVABILITY_UNCONFIRMED", message: "Observability evidence exists but no concrete monitoring requirement was confirmed." });
  }
  if (!blueprint.delivery.deployment || !Object.keys(blueprint.delivery.deployment).length) {
    issues.push({ severity: "warning", code: "DEPLOYMENT_TARGET_UNCONFIRMED", message: "No deployment target was confirmed; deployment artifacts can remain target-neutral." });
  }
  return {
    version: "1.0",
    valid: !issues.some(issue => issue.severity === "critical"),
    issues,
    critical: issues.filter(issue => issue.severity === "critical"),
    warnings: issues.filter(issue => issue.severity === "warning")
  };
}

function writeSolutionBlueprint(root, model, filename = "muleforge-solution-blueprint.json") {
  const fs = require("node:fs");
  const path = require("node:path");
  const blueprint = buildSolutionBlueprint(model);
  const validation = validateSolutionBlueprint(model, blueprint);
  const target = path.join(path.resolve(root), filename);
  fs.writeFileSync(target, JSON.stringify({ ...blueprint, validation }, null, 2) + "\n", "utf8");
  return { path: target, blueprint, validation };
}

module.exports = {
  buildSolutionBlueprint,
  validateSolutionBlueprint,
  writeSolutionBlueprint
};
