const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const YAML = require("yaml");
const { buildTraceability } = require("./traceability");
const { classifyWorkload } = require("./workload-engine");
const { checkEndToEndArtifacts } = require("./end-to-end");

function readConfig(file = "muleforge.yaml") {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error(`Configuration not found: ${file}`);
  return YAML.parse(fs.readFileSync(full, "utf8")) || {};
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function safeRead(root, relative) {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function result(name, pass, detail) {
  return { name, pass, detail };
}

function traceabilityIntegrity(root, config) {
  const file = path.join(root, "muleforge-traceability.json");
  if (!fs.existsSync(file)) return { valid: false, detail: "muleforge-traceability.json is missing." };
  try {
    const actual = JSON.parse(fs.readFileSync(file, "utf8"));
    const expected = buildTraceability(config);
    const actualRequirements = Array.isArray(actual.requirements) ? actual.requirements : [];
    const actualOperations = Array.isArray(actual.operations) ? actual.operations : [];
    const expectedRequirements = expected.requirements || [];
    const expectedOperations = expected.operations || [];
    const requirementOk = actualRequirements.length === expectedRequirements.length &&
      actualRequirements.every((item, index) =>
        item.requirementId === expectedRequirements[index].requirementId &&
        item.text === expectedRequirements[index].text
      );
    const operationOk = actualOperations.length === expectedOperations.length &&
      actualOperations.every((item, index) => {
        const exp = expectedOperations[index];
        const actualRules = Array.isArray(item.rules) ? item.rules : [];
        const expectedRules = Array.isArray(exp.rules) ? exp.rules : [];
        return item.operation === exp.operation && item.method === exp.method && item.path === exp.path &&
          item.connector === exp.connector &&
          actualRules.length === expectedRules.length &&
          actualRules.every((rule, ruleIndex) =>
            rule.ruleId === expectedRules[ruleIndex].ruleId &&
            rule.type === expectedRules[ruleIndex].type &&
            rule.munitTest === expectedRules[ruleIndex].munitTest
          );
      });
    return {
      valid: actual.version === expected.version && requirementOk && operationOk,
      detail: actual.version !== expected.version
        ? "Traceability manifest version does not match the current generator."
        : requirementOk && operationOk
          ? "Traceability manifest matches the confirmed project model."
          : "Traceability manifest is stale or does not match the confirmed project model."
    };
  } catch (error) {
    return { valid: false, detail: "Traceability manifest is not valid JSON: " + error.message };
  }
}

function verifyProject(file = "muleforge.yaml", options = {}) {
  const config = readConfig(file);
  const root = path.resolve(path.dirname(file));
  const project = config.project || {};
  const api = config.api || {};
  const artifactId = project.artifactId || project.name || "mule-api";
  const ramlPath = `src/main/resources/api/${artifactId}.raml`;
  const mulePath = `src/main/mule/${artifactId}.xml`;
  const munitPath = `src/test/munit/${artifactId}-test.xml`;
  const pom = safeRead(root, "pom.xml");
  const raml = safeRead(root, ramlPath);
  const mule = safeRead(root, mulePath);
  const application = safeRead(root, "src/main/resources/application.yaml");
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const workload = classifyWorkload({ model: config });
  const apiWorkload = workload.type === "api";
  const checks = [];

  const hasRequirement = Boolean(
    (config.requirement && String(config.requirement).trim()) ||
    (Array.isArray(config.requirements) && config.requirements.some(req => req && String(req.text || req.requirement || '').trim()))
  );
  checks.push(result("Requirement exists", hasRequirement, "muleforge.yaml must contain a confirmed requirement."));
  checks.push(result("Project metadata", Boolean(project.name), "project.name is required."));
  checks.push(result("API metadata", !apiWorkload || Boolean(api.name && api.basePath), apiWorkload ? "api.name and api.basePath are required for API workloads." : "API metadata is not required for non-API workloads."));
  checks.push(result("Operations defined", apiWorkload ? operations.length > 0 : (operations.length > 0 || (config.connectors || []).length > 0 || (config.events || config.triggers || []).length > 0), apiWorkload ? "At least one confirmed API operation is required." : "A non-API workload must have an operation, connector or trigger definition."));
  checks.push(result("No unresolved document conflicts", !Array.isArray(config.conflicts) || config.conflicts.length === 0, "Conflicting source documents must be resolved before generation is considered ready."));
  checks.push(result("Required connectivity configuration", !Array.isArray(config.missingConfigurations) || config.missingConfigurations.length === 0, "Required non-secret connectivity values must be explicitly resolved; credentials may remain environment placeholders."));
  checks.push(result("Operation connector mapping", operations.every(op => (op.connector || !(Array.isArray(config.connectors) && config.connectors.length)) && !op.connectorAmbiguous), "Every analyzed operation must have one unambiguous connector mapping; legacy/reference configs without explicit connector metadata use HTTP as the default source."));
  const supportedConnectors = new Set(["http", "database", "snowflake", "sftp", "ibm-mq", "anypoint-mq", "object-store", "file", "email", "jms", "kafka", "salesforce"]);
  const unsupportedOperations = operations.filter(op => op.connector && !supportedConnectors.has(String(op.connector).toLowerCase().replace(/_/g, "-")));
  checks.push(result("Supported operation connectors", unsupportedOperations.length === 0, unsupportedOperations.length ? "Unsupported connectors cannot be silently replaced with generic business flows: " + unsupportedOperations.map(op => op.connector).join(", ") : "Every operation uses a supported generated connector."));
  checks.push(result("Maven project", Boolean(pom && /<project[\s>]/.test(pom)), "pom.xml must contain a Maven project."));
  for (const connector of (config.connectors || []).map(v => String(v).toLowerCase().replace(/_/g, "-"))) {
    if (connector === "http") continue;
    const dependencyPattern =
      connector === "ibm-mq" ? /mule-ibm-mq-connector/ :
      connector === "anypoint-mq" ? /mule-anypoint-mq-connector/ :
      connector === "sftp" ? /mule-sftp-connector/ :
      connector === "snowflake" ? /mule4-snowflake-connector/ :
      connector === "database" ? /mule-db-connector/ :
      null;
    if (dependencyPattern) checks.push(result("Maven dependency " + connector, dependencyPattern.test(pom), "pom.xml must include the " + connector + " connector dependency."));
  }
  checks.push(result("Mule artifact", exists(root, "mule-artifact.json"), "mule-artifact.json is required."));
  checks.push(result("Requirement traceability", exists(root, "muleforge-traceability.json") && exists(root, "docs/11-traceability.md"), "Generated projects must include machine-readable and human-readable requirement traceability."));
  const traceability = traceabilityIntegrity(root, config);
  checks.push(result("Traceability integrity", traceability.valid, traceability.detail));
  checks.push(result("Generated environment properties", ["dev","qa","uat","prod"].every(e => exists(root, "src/main/resources/properties/application-" + e + ".yaml")), "DEV/QA/UAT/PROD property files should be present."));
  checks.push(result("Postman collection", !apiWorkload || exists(root, "postman"), apiWorkload ? "API projects should include a Postman artifact directory." : "Postman is not required for non-API workloads."));
  checks.push(result("Application configuration", Boolean(application), "application.yaml is required."));
  checks.push(result("RAML exists", !workload.ramlRequired || Boolean(raml), workload.ramlRequired ? `Expected ${ramlPath}.` : "RAML is not required for this workload."));
  checks.push(result("Mule implementation exists", Boolean(mule), `Expected ${mulePath}.`));

  if (raml) {
    checks.push(result("RAML header", raml.startsWith("#%RAML 1.0"), "RAML must declare RAML 1.0."));
    checks.push(result("RAML base path", api.basePath ? raml.includes(`baseUri: ${api.basePath}`) : true, "RAML baseUri must match the confirmed API base path."));
    for (const op of operations) {
      const method = String(op.method || "").toLowerCase();
      const pathPresent = op.path && raml.includes(`${op.path}:`);
      const methodPresent = method && raml.includes(`  ${method}:`);
      checks.push(result(`RAML operation ${String(op.method).toUpperCase()} ${op.path}`, Boolean(pathPresent && methodPresent), "Operation must be represented in the generated RAML."));
    }
  }

  if (mule) {
    const explicitConnectivity = Array.isArray(config.connectivity) ? config.connectivity : [];
    for (const item of explicitConnectivity) {
      const type = String(item.type || '').toLowerCase().replace(/_/g, '-');
      const values = ['endpoint', 'host', 'port', 'path', 'queue', 'topic', 'queueManager', 'channel', 'accountName', 'warehouse', 'database', 'schema', 'role']
        .filter(field => item[field] !== undefined && item[field] !== null && String(item[field]).trim() !== '')
        .map(field => String(item[field]));
      if (values.length) checks.push(result(
        'Explicit connectivity values ' + type,
        values.every(value => mule.includes(value) || application.includes(value)),
        'Every explicit non-secret connectivity value from the requirement package must appear in the generated Mule configuration or application.yaml.'
      ));
    }
    const connectorIds = new Set((config.connectors || []).map(v => String(v).toLowerCase().replace(/_/g, "-")));
    if (connectorIds.has("sftp")) checks.push(result("SFTP configuration", /<sftp:config\b/.test(mule), "SFTP selection requires a generated configuration."));
    if (connectorIds.has("snowflake")) checks.push(result("Snowflake configuration", /<snowflake:snowflake-config\b/.test(mule) && /<snowflake:(select|insert)\b/.test(mule), "Snowflake selection requires a native Snowflake configuration and operation."));
    if (connectorIds.has("ibm-mq")) checks.push(result("IBM MQ configuration", /<ibm-mq:config\b/.test(mule) && /<ibm-mq:publish\b/.test(mule), "IBM MQ selection requires a generated configuration and publish operation."));
    if (connectorIds.has("anypoint-mq")) checks.push(result("Anypoint MQ configuration", /<anypoint-mq:config\b/.test(mule) && /<anypoint-mq:publish\b/.test(mule), "Anypoint MQ selection requires a generated configuration and publish operation."));
    checks.push(result("Mule XML declaration", mule.startsWith("<?xml"), "Mule XML should contain an XML declaration."));
    checks.push(result("Mule root", /<mule\b/.test(mule) && /<\/mule>\s*$/.test(mule), "Mule XML must have a mule root element."));
    checks.push(result("No escaped-newline artifacts", !mule.includes("\\n"), "Generated Mule XML must contain real line breaks, not literal \\n text."));
    const flowBlocks = [...mule.matchAll(/<flow\b[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/flow>/g)];
    const flowNames = new Set(flowBlocks.map(m => m[1]));
    const isApiKit = String(api.implementation || api.router || "").toLowerCase() === "apikit";
    const expectedOperationFlowNames = isApiKit
      ? operations.map(op => {
          const method = String(op.method || "GET").toLowerCase();
          const route = String(op.path || "/").replace(/^\//, "").split("/").filter(Boolean).join("\\") || "";
          const suffix = ["post", "put", "patch"].includes(method) ? ":application\\json" : "";
          return method + ":" + route + suffix + ":api-config";
        })
      : operations.map(op => artifactId + "-" + String(op.name || "").replace(/[^A-Za-z0-9_-]/g, "-") + "-flow");
    checks.push(result("Unique generated operation flow names", new Set(expectedOperationFlowNames).size === expectedOperationFlowNames.length, "Operation names/routes must remain unique in the generated Mule implementation."));
    const operationFlowsChecked = operations.map((op, index) => ({
      name: expectedOperationFlowNames[index],
      block: flowBlocks.find(m => m[1] === expectedOperationFlowNames[index])?.[0] || ""
    }));
    checks.push(result("Flow error handling", isApiKit ? operationFlowsChecked.every(x => !x.block || /<error-handler>/.test(x.block)) : operationFlowsChecked.every(x => /<error-handler>/.test(x.block)), isApiKit ? "APIKit operation flows may rely on router/runtime error handling when no operation-specific errors are declared." : "Every generated operation flow must contain its own error handler."));
    checks.push(result("Generated operation flow names", operationFlowsChecked.every(x => flowNames.has(x.name)), "Every configured operation must map to a generated Mule flow."));
    checks.push(result("APIKit router", !isApiKit || mule.includes("<apikit:router"), "APIKit implementations must contain an explicit apikit:router."));
    checks.push(result("HTTP listener config", /<http:listener-config\b/.test(mule), "An HTTP listener configuration is expected for HTTP APIs."));
    for (const op of operations) {
      const expectedPath = (api.basePath || "") + (op.path || "");
      const pathPresent = op.schedule ? /<scheduler\b/.test(mule) : isApiKit ? mule.includes('path="' + (api.basePath || "/api/v1") + '/*"') : (mule.includes('path="' + expectedPath + '"') || mule.includes("path='" + expectedPath + "'"));
      const methodPresent = op.schedule ? true : isApiKit ? /allowedMethods="[^"]*(GET|POST|PUT|PATCH|DELETE|OPTIONS)/.test(mule) : (mule.includes('allowedMethods="' + String(op.method).toUpperCase() + '"') || mule.includes("allowedMethods='" + String(op.method).toUpperCase() + "'"));
      const sourcePresent = op.schedule ? /<scheduler\b/.test(mule) : Boolean(pathPresent && methodPresent);
      const connector = String(op.connector || "").toLowerCase().replace(/_/g, "-");
      const destinationPresent = isApiKit ? true : (connector === "ibm-mq" || connector === "anypoint-mq" ? mule.includes('destination="' + (op.destination || "") + '"') : true);
      const filePresent = isApiKit ? true : (connector === "sftp" && op.filePath ? mule.includes('path="' + op.filePath + '"') : true);
      checks.push(result("Mule operation " + String(op.method).toUpperCase() + " " + op.path, Boolean(sourcePresent && destinationPresent && filePresent), isApiKit ? "APIKit operations are routed through the shared APIKit listener/router." : "Generated source and documented connector destination/path must match the confirmed operation."));
    }
  }

  const operationFlowsForCoverage = mule
    ? [...mule.matchAll(/<flow\b[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/flow>/g)].map(m => ({ name: m[1], block: m[0] }))
    : [];

  if ((config.testing || {}).munit !== false) {
    const munit = safeRead(root, munitPath);
    checks.push(result("MUnit scaffold", Boolean(munit), `Expected ${munitPath}.`));
    if (munit) {
      for (const op of operations) {
        const safe = String(op.name || `${op.method}-${op.path}`).replace(/[^A-Za-z0-9_-]/g, "-");
        const happy = new RegExp(`name="[^"]*${safe}-happy-path-test"`);
        checks.push(result(
          `MUnit happy-path coverage ${op.name}`,
          happy.test(munit),
          "Every confirmed operation must have a generated happy-path MUnit test."
        ));
        if (Array.isArray(op.validation) && op.validation.length) {
          const validation = new RegExp(`name="[^"]*${safe}-validation-test"`);
          checks.push(result(
            `MUnit validation coverage ${op.name}`,
            validation.test(munit),
            "Every operation with confirmed validation rules must have a generated validation MUnit test."
          ));
        }
        const declaredStatuses = new Set((Array.isArray(op.errorStatuses) ? op.errorStatuses : []).map(Number).filter(Number.isInteger));
        for (const error of Array.isArray(op.errors) ? op.errors : []) {
          const text = typeof error === "string" ? error : JSON.stringify(error || "");
          for (const match of text.matchAll(/\b([4-5]\d\d)\b/g)) declaredStatuses.add(Number(match[1]));
        }
        if (declaredStatuses.has(409)) {
          const conflict = new RegExp('name="[^"]*' + safe + '-conflict-or-duplicate-test"');
          checks.push(result("MUnit conflict coverage " + op.name, conflict.test(munit), "A confirmed 409 conflict/duplicate outcome must have a generated conflict MUnit test."));
        }
        if ([500, 502, 503, 504].some(status => declaredStatuses.has(status))) {
          const connector = new RegExp('name="[^"]*' + safe + '-connector-error-test"');
          checks.push(result("MUnit connector-error coverage " + op.name, connector.test(munit), "A confirmed server/dependency failure outcome must have a generated connector-error MUnit test."));
        }
        if (op.retry) {
          const retry = new RegExp('name="[^"]*' + safe + '-retry-exhaustion-test"');
          checks.push(result("MUnit retry coverage " + op.name, retry.test(munit), "A confirmed retry policy must have a generated retry-exhaustion MUnit test."));
        }
        if (op.transaction) {
          const transaction = new RegExp('name="[^"]*' + safe + '-transaction-rollback-test"');
          checks.push(result("MUnit transaction coverage " + op.name, transaction.test(munit), "A confirmed transaction policy must have a generated rollback MUnit test."));
        }
        if (op.idempotency) {
          const idempotency = new RegExp('name="[^"]*' + safe + '-idempotency-duplicate-test"');
          checks.push(result("MUnit idempotency coverage " + op.name, idempotency.test(munit), "A confirmed idempotency policy must have a generated duplicate-request MUnit test."));
        }
        if (op.pagination) {
          const pagination = new RegExp('name="[^"]*' + safe + '-pagination-test"');
          checks.push(result("MUnit pagination coverage " + op.name, pagination.test(munit), "A confirmed pagination policy must have a generated pagination MUnit test."));
        }
      }
    }
  }

  if ((config.testing || {}).munit !== false && exists(root, munitPath)) {
    const traceability = buildTraceability(config, root);
    const munit = safeRead(root, munitPath);
    for (const operation of traceability.operations || []) {
      for (const rule of operation.rules || []) {
        const muleAssetPresent = Boolean(rule.mule) && exists(root, rule.mule);
        const operationSafeName = String(operation.operation || operation.name || '').replace(/[^A-Za-z0-9_-]/g, '-');
        const munitTestPresent = Boolean(rule.munitTest) && (
          new RegExp('name="[^"]*' + String(rule.munitTest) + '"').test(munit) ||
          (Number(rule.status) === 400 && new RegExp('<munit:test\\b[^>]*name="[^"]*' + operationSafeName + '[^"]*"[^>]*>[\\s\\S]*?400[\\s\\S]*?<\\/munit:test>').test(munit))
        );
        checks.push(result(
          "Traceability Mule asset " + rule.ruleId,
          muleAssetPresent,
          "Every confirmed behavior rule must point to an existing generated Mule implementation asset."
        ));
        checks.push(result(
          "Traceability MUnit test " + rule.ruleId,
          munitTestPresent,
          rule.munitTest
            ? "Every executable behavior rule must point to an existing generated MUnit test."
            : "Every confirmed behavior rule must have an executable MUnit mapping."
        ));
      }
    }
  }

  function declaredErrorStatuses(op) {
    const statuses = new Set(Array.isArray(op.errorStatuses) ? op.errorStatuses.map(Number).filter(Number.isInteger) : []);
    for (const error of Array.isArray(op.errors) ? op.errors : []) {
      const text = typeof error === "string" ? error : JSON.stringify(error || "");
      for (const match of text.matchAll(/\b([4-5]\d\d)\b/g)) statuses.add(Number(match[1]));
      const statusMap = {
        bad_request: 400, validation: 400, unauthorized: 401, forbidden: 403,
        not_found: 404, conflict: 409, too_many_requests: 429,
        unavailable: 503, timeout: 504, internal: 500, server_error: 500
      };
      for (const [key, status] of Object.entries(statusMap)) if (new RegExp(key.replace("_", "[ _-]"), "i").test(text)) statuses.add(status);
    }
    return [...statuses];
  }

  for (const op of operations) {
    const operationXml = operationFlowsForCoverage.find(x => x.name === `${artifactId}-${String(op.name || "").replace(/[^A-Za-z0-9_-]/g, "-")}-flow`)?.block || mule;
    if (Array.isArray(op.validation) && op.validation.length) {
      const validationImplemented = /VALIDATION:VALIDATION|VALIDATION_ERROR|Invalid email|isEmpty\(payload/i.test(operationXml);
      checks.push(result(
        `Business validation coverage ${op.name}`,
        validationImplemented,
        "Every confirmed validation rule must have observable validation logic/error handling in the generated Mule implementation."
      ));
    }
    const errorStatuses = declaredErrorStatuses(op);
    for (const status of errorStatuses) {
      checks.push(result(
        `Business error status ${op.name} ${status}`,
        operationXml.includes(`value="${status}"`) || operationXml.includes(`default ${status}`) || operationXml.includes(`statusCode="${status}"`) || operationXml.includes(`status: ${status}`),
        `Confirmed business/dependency error status ${status} must be represented in the generated operation implementation.`
      ));
    }
    for (const field of op.requestFields || []) {
      const fieldName = typeof field === "string" ? field : field && field.name;
      const mentioned = Boolean(fieldName) && (raml.includes(String(fieldName)) || mule.includes(String(fieldName)));
      checks.push(result(`Request field ${fieldName || "(unnamed)"}`, mentioned, "Request field should be represented in the generated API or implementation."));
    }
    if (op.successStatus) {
      checks.push(result(`Success status ${op.name}`, raml.includes(String(op.successStatus)), "Confirmed success status should appear in the RAML contract."));
    }
    for (const field of op.responseFields || []) {
      const fieldName = typeof field === "string" ? field : field && field.name;
      const mentioned = Boolean(fieldName) && (raml.includes(String(fieldName)) || mule.includes(String(fieldName)));
      checks.push(result(`Response field ${fieldName || "(unnamed)"}`, mentioned, "Confirmed response field should be represented in the generated API or implementation."));
    }
  }

  const endToEnd = checkEndToEndArtifacts(root, { ...config, workloadType: workload.type });
  checks.push(result("End-to-end generated artifact set", endToEnd.complete, endToEnd.complete ? "All required lifecycle artifacts are present." : "Required generated artifacts are missing: " + endToEnd.missing.map(item => item.path).join(", ")));

  const passed = checks.filter(c => c.pass).length;
  const score = checks.length ? Math.round((passed / checks.length) * 100) : 0;
  const failed = checks.filter(c => !c.pass);
  let build = { skipped: true, pass: true, detail: "Build not requested." };
  if (options.build && !failed.length) {
    try {
      execFileSync(process.platform === "win32" ? "mvn.cmd" : "mvn", ["test"], { cwd: root, stdio: "inherit" });
      build = { skipped: false, pass: true, detail: "Maven tests passed." };
    } catch (e) {
      build = { skipped: false, pass: false, detail: `Maven tests failed with exit code ${e.status || 1}.` };
    }
  }

  return { score, passed, total: checks.length, checks, failed, build, ready: failed.length === 0 && build.pass };
}

function printReport(report) {
  console.log("\n🚀 MuleForge Verification\n");
  for (const check of report.checks) console.log(`${check.pass ? "✔" : "✖"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  if (!report.build.skipped) console.log(`${report.build.pass ? "✔" : "✖"} Maven tests — ${report.build.detail}`);
  console.log(`\nCoverage score: ${report.score}%`);
  console.log(report.ready ? "\n✓ READY FOR DEVELOPER REVIEW\n" : "\n✖ NOT READY — fix the reported issues before review\n");
}

module.exports = { verifyProject, printReport };
