const { resolveConnectors } = require("./connectors");
const { connectorFlow } = require("./connector-flow-generator");
const { generateBusinessFlows } = require("./business-generator");
const { generateDataWeaveFiles } = require("./dataweave-generator");
const { generateMunit } = require("./munit-generator");
const { generatePostman } = require("./production");

function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function context(config) {
  const p = config.project || {};
  const a = config.api || {};
  const db = config.database || {};
  const requested = [...(config.connectors || []), ...(db.type === "snowflake" ? ["database"] : [])];
  if (requested.some(c => String(c).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-") === "snowflake")) requested.push("database");
  const connectors = resolveConnectors(requested);
  const snowflake = db.type === "snowflake" || connectors.some(c => c.id === "snowflake");
  return {
    projectName: p.name || "mule-api",
    artifactId: p.artifactId || p.name || "mule-api",
    apiName: a.name || p.name || "Mule API",
    apiVersion: a.version || "v1",
    basePath: a.basePath || "/api/v1",
    connectors,
    hasSnowflake: snowflake,
    hasDatabase: Boolean(db.type) || snowflake || connectors.some(c => c.id === "database"),
    databaseType: db.type || (snowflake ? "snowflake" : ""),
    databaseTable: db.table || "CUSTOMER",
    java: p.java || "17",
    muleRuntime: p.muleRuntime || "4.9.0"
  };
}

function generateRaml(config, d) {
  let out = `#%RAML 1.0\ntitle: ${d.apiName}\nversion: ${d.apiVersion}\nbaseUri: ${d.basePath}\n\n`;
  const groups = new Map();
  for (const op of config.operations || []) {
    if (!groups.has(op.path)) groups.set(op.path, []);
    groups.get(op.path).push(op);
  }
  for (const [resource, ops] of groups) {
    out += `${resource}:\n`;
    for (const op of ops) {
      const code = op.successStatus || (String(op.method).toUpperCase() === "POST" ? 201 : 200);
      out += `  ${String(op.method).toLowerCase()}:\n    description: ${op.name || `${op.method} ${op.path}`}\n    responses:\n      ${code}:\n        body:\n          application/json:\n            type: object\n`;
    }
  }
  return out;
}

function namespaces(d) {
  const ids = new Set(d.connectors.map(c => c.id));
  return [
    ids.has("sftp") && 'xmlns:sftp="http://www.mulesoft.org/schema/mule/sftp"',
    ids.has("anypoint-mq") && 'xmlns:anypoint-mq="http://www.mulesoft.org/schema/mule/anypoint-mq"',
    ids.has("ibm-mq") && 'xmlns:ibm-mq="http://www.mulesoft.org/schema/mule/ibm-mq"',
    ids.has("object-store") && 'xmlns:os="http://www.mulesoft.org/schema/mule/os"'
  ].filter(Boolean).join(" ");
}

function schemas(d) {
  const ids = new Set(d.connectors.map(c => c.id));
  const base = [
    "http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd",
    "http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule.xsd",
    "http://www.mulesoft.org/schema/mule/ee http://www.mulesoft.org/schema/mule/ee/core/mule-ee.xsd"
  ];
  if (d.hasDatabase) base.push("http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd");
  if (ids.has("sftp")) base.push("http://www.mulesoft.org/schema/mule/sftp http://www.mulesoft.org/schema/mule/sftp/current/mule-sftp.xsd");
  if (ids.has("anypoint-mq")) base.push("http://www.mulesoft.org/schema/mule/anypoint-mq http://www.mulesoft.org/schema/mule/anypoint-mq/current/mule-anypoint-mq.xsd");
  if (ids.has("ibm-mq")) base.push("http://www.mulesoft.org/schema/mule/ibm-mq http://www.mulesoft.org/schema/mule/ibm-mq/current/mule-ibm-mq.xsd");
  if (ids.has("object-store")) base.push("http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd");
  return base.join(" ");
}

function generateMuleXml(config, d) {
  const databaseConfig = d.hasDatabase
    ? `\n  <db:config name="Database_Config"><db:generic-connection url="\${db.url}" driverClassName="${d.hasSnowflake ? "net.snowflake.client.jdbc.SnowflakeDriver" : ""}" user="\${db.user}" password="\${db.password}" /></db:config>\n`
    : "";
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:http="http://www.mulesoft.org/schema/mule/http" xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" xmlns:db="http://www.mulesoft.org/schema/mule/db" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${namespaces(d)} xsi:schemaLocation="${schemas(d)}">\n  <http:listener-config name="HTTP_Listener_config"><http:listener-connection host="0.0.0.0" port="\${http.port}" /></http:listener-config>${databaseConfig}`;
  const flows = (config.operations || []).map(op => connectorFlow(op, d)).filter(Boolean);
  return `${header}${flows.length ? flows.join("\n") : generateBusinessFlows(config, d)}</mule>\n`;
}

function scenarioText(model) {
  const rows = [];
  for (const op of model.operations || []) {
    rows.push(`### ${op.method} ${op.path} — happy path\n\n- Given a valid request\n- When the operation is invoked\n- Then return HTTP ${op.successStatus}`);
    for (const validation of op.validation || []) rows.push(`### ${op.method} ${op.path} — validation: ${validation}\n\n- Given the request violates the rule\n- When the operation is invoked\n- Then return HTTP 400`);
    for (const error of op.errors || []) rows.push(`### ${op.method} ${op.path} — ${error}\n\n- Given the described business or dependency condition\n- When the operation is invoked\n- Then return the documented error status and response`);
  }
  return rows.join("\n\n") || "No scenarios could be derived.";
}

function documentation(model) {
  const endpoints = (model.operations || []).map(op => `- **${op.method} ${op.path}** — ${op.name}`).join("\n") || "- No operations confirmed.";
  return {
    "solution-design.md": `# Solution Design\n\n## Confirmed requirement\n\n${model.requirement}\n\n## API operations\n${endpoints}\n\n## Connectors inferred\n${(model.connectors || []).map(c => `- ${c}`).join("\n") || "- None"}\n\n> No backend credentials or environment connection details are required for analysis.\n`,
    "requirements.md": `# Requirements\n\n${model.requirement}\n\n## Decisions\n${(model.decisions || []).map(d => `- ${d}`).join("\n") || "- Backend credentials are intentionally not requested."}\n`,
    "architecture.md": `# Architecture\n\nClient → HTTP Listener → Validation → Business Logic → Connector/Backend (if required) → DataWeave → Response/Error Handler\n`,
    "api-overview.md": `# API Overview\n\nBase path: \`${model.api.basePath}\`\n\n${endpoints}\n`,
    "main-flow.md": `# End-to-End Flow\n\n${(model.operations || []).map(op => `## ${op.name}\n\n**${op.method} ${op.path}**\n\n1. Receive request through HTTP Listener\n2. Validate request and required fields\n3. Execute business logic inferred from the requirement\n4. Invoke only the required connector/backend abstraction\n5. Transform request/response with DataWeave\n6. Return HTTP ${op.successStatus} on success\n7. Route validation, business, dependency and unexpected errors to the standard error handler`).join("\n\n")}`,
    "test-scenarios.md": `# Test Scenarios\n\n${scenarioText(model)}\n`,
    "deployment.md": `# Deployment Notes\n\nTarget: ${model.deployment?.target || "none"}\n\nEnvironment values and secrets remain placeholders. MuleForge does not require live backend access to analyze a requirement or produce the solution assets.\n`
  };
}

function generateUiAssets(model) {
  const d = context(model);
  const dwl = generateDataWeaveFiles(model).map(x => ({ name: x.name, request: x.request, response: x.response }));
  const files = {};
  files[`${d.artifactId}.raml`] = generateRaml(model, d);
  files[`${d.artifactId}.xml`] = generateMuleXml(model, d);
  for (const mapping of dwl) {
    files[`${mapping.name}-request.dwl`] = mapping.request;
    files[`${mapping.name}-response.dwl`] = mapping.response;
  }
  if ((model.testing || {}).munit !== false) files[`${d.artifactId}-test.xml`] = generateMunit(model, d);
  files[`${d.artifactId}.collection.json`] = generatePostman(model, d);
  const docs = documentation(model);
  for (const [name, content] of Object.entries(docs)) files[name] = content;
  return {
    summary: {
      project: d.projectName,
      api: d.apiName,
      basePath: d.basePath,
      operations: model.operations || [],
      connectors: d.connectors.map(c => c.name),
      credentialFree: true
    },
    files
  };
}

module.exports = { generateUiAssets, context, generateRaml, generateMuleXml };
