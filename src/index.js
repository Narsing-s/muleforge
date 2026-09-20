#!/usr/bin/env node
const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");
const YAML = require("yaml");
const { buildConnectorDependencies, resolveConnectors } = require("./connectors");
const { registerCreate } = require("./create-command");
const { readRequirementDocument, extractDocumentBuffer, analyzeRequirementDocument } = require("./document-analyzer");
const { verifyProject, printReport } = require("./verify");
const { generateBusinessFlows } = require("./business-generator");
const { connectorFlow } = require("./connector-flow-generator");
const { generateDataWeaveFiles } = require("./dataweave-generator");
const { generateMunit } = require("./munit-generator");
const { startUi } = require("./ui-server");
const { writeProductionArtifacts } = require("./production");
const { writeDocumentation } = require("./requirement-model");
const { writeTraceability } = require("./traceability");
const { auditProject, printAudit } = require("./quality-audit");
const { deploymentArtifacts } = require("./deployment-artifacts");
const { inspectProject, printInspection } = require("./project-inspector");
const { validateContract } = require("./contract-validator");
const { validateDeployment, validateOperationPolicies } = require("./contract-validator");
const { auditConnectors } = require("./connector-audit");
const { repairProject, repairAndVerify } = require("./repair");
const { snapshot, diffSnapshots } = require("./diff");
const { renderProperties } = require("./schema-generator");
const { openApiYaml } = require("./openapi-generator");
const { generateApiKitFlow, generateApiKitConfig } = require("./apikit-generator");
const { runtimeTest } = require("./runtime-test");
const { runBreakingCheck } = require("./breaking-check");
const { buildIntegrationIR, validateIntegrationIR } = require("./semantic-ir");
const { scanSecrets, scanDependencies, sbom } = require("./security-scan");
const { validateDirectory, validateScript } = require("./dataweave-validator");
const { importProject, writeImportedModel } = require("./import-project");
const { writeReconciliation } = require("./reconciliation");
const { writeReadiness } = require("./readiness");
const { writePromotionPlan } = require("./promotion");
const { buildEventModel, validateEventModel } = require("./event-model");
const { generateHealthFlows } = require("./health-generator");
const { pipelineModel, renderPipeline } = require("./ci-pipeline");
const { writeManifest } = require("./provenance");
const { dependencyAudit } = require("./dependency-audit");
const { writeSoapScaffold } = require("./soap-generator");
const { writeGraphql } = require("./graphql-generator");
const { signManifest, verifyManifest, generateSigningKeys } = require("./artifact-signing");
const { writeIdeManifest } = require("./ide-manifest");
const { executeDataWeave, compareExpected } = require("./dataweave-runtime");
const { writeGoldenReport } = require("./golden-regression");
const { writeEventRuntime } = require("./event-runtime-generator");
const { writeNative } = require("./ci-native");
const { validateConfigValues } = require("./config-schema");
const { validateApiGovernance } = require("./api-governance");
const { checkRuntimeCompatibility } = require("./runtime-compatibility");
const { environmentDiff } = require("./environment-diff");
const { classifyWorkload, buildEngineeringPlan, explainImportedProject, writeEngineeringPlan } = require("./workload-engine");

const VERSION = "0.9.18";
const program = new Command();
const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, "utf8"); };
const render = (template, data) => {
  const valueAt = (scope, key) => key.split(".").reduce((value, part) => value == null ? undefined : value[part], scope);
  const renderBlock = (source, scope) => {
    let out = source;
    const blockPattern = /{{#(each|if|unless)\s+([^}]+)}}([\s\S]*?){{\/\1}}/g;
    let match;
    while ((match = blockPattern.exec(out))) {
      const [, kind, key, body] = match;
      const value = valueAt(scope, key.trim());
      let replacement = "";
      if (kind === "each") {
        if (Array.isArray(value)) replacement = value.map(item => renderBlock(body, item)).join("");
      } else if ((kind === "if" && value) || (kind === "unless" && !value)) {
        replacement = renderBlock(body, scope);
      }
      out = out.slice(0, match.index) + replacement + out.slice(match.index + match[0].length);
      blockPattern.lastIndex = 0;
    }
    return out.replace(/{{\s*([^#\/][^}]*)\s*}}/g, (_, key) => {
      const value = valueAt(scope, key.trim());
      return value == null ? "" : String(value);
    });
  };
  return renderBlock(template, data);
};
function runtimeCheck(directory = ".") {
  const root = path.resolve(directory);
  const checks = [];
  const commandVersion = (command, args) => {
    try { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0]; }
    catch (error) { return null; }
  };
  const java = commandVersion(process.platform === "win32" ? "java.exe" : "java", ["-version"]);
  const maven = commandVersion(process.platform === "win32" ? "mvn.cmd" : "mvn", ["-version"]);
  checks.push({ name: "Java", available: Boolean(java), version: java || "not found" });
  checks.push({ name: "Maven", available: Boolean(maven), version: maven || "not found" });
  for (const file of ["pom.xml", "mule-artifact.json"]) checks.push({ name: file, available: fs.existsSync(path.join(root, file)), version: fs.existsSync(path.join(root, file)) ? "present" : "missing" });
  const result = { directory: root, ready: checks.every(c => c.available), checks, note: "A real Maven build may additionally require MuleSoft repository access and credentials configured outside the repository." };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
function loadConfig(file = "muleforge.yaml") { const full = path.resolve(file); if (!fs.existsSync(full)) throw new Error(`Configuration not found: ${file}`); return YAML.parse(fs.readFileSync(full, "utf8")) || {}; }
function context(config) { const p = config.project || {}, a = config.api || {}, db = config.database || {}; const workload = classifyWorkload({ model: config }); const requested = [...(config.connectors || []), ...(db.type === "snowflake" ? ["database"] : []), ...((config.operations || []).some(o => o.idempotency) ? ["object-store"] : [])]; if (requested.some(c => String(c).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-") === "snowflake")) requested.push("database"); const connectors = resolveConnectors(requested); const snowflake = db.type === "snowflake" || connectors.some(c => c.id === "snowflake"); return { projectName: p.name || "mule-api", artifactId: p.artifactId || p.name || "mule-api", groupId: p.groupId || "com.example", version: p.version || "1.0.0", muleRuntime: p.muleRuntime || "4.9.0", java: p.java || "17", apiName: a.name || p.name || "Mule API", apiVersion: a.version || "v1", basePath: a.basePath || "/api/v1", connectors, connectorDependencies: buildConnectorDependencies(config, config.connectorVersions || config.connectors?.versions || {}), hasSnowflake: snowflake, hasDatabase: Boolean(db.type) || snowflake || connectors.some(c => c.id === "database"), databaseType: db.type || (snowflake ? "snowflake" : ""), databaseTable: db.table || "CUSTOMER", databaseUrl: db.url || "${db.url}", databaseUser: db.user || "${db.user}", databasePassword: db.password || "${db.password}", databaseDriverClass: db.type === "mysql" ? "com.mysql.cj.jdbc.Driver" : db.type === "postgres" || db.type === "postgresql" ? "org.postgresql.Driver" : db.type === "oracle" ? "oracle.jdbc.OracleDriver" : "", hasSftp: connectors.some(c => c.id === "sftp"), apiImplementation: String(a.implementation || a.router || "listener").toLowerCase(), workloadType: workload.type, apiContractRequired: workload.apiContractRequired }; }
function jsonExampleValue(field) {
  const f = typeof field === "string" ? { name: field, type: "string" } : (field || {});
  const name = String(f.name || f.field || "").toLowerCase();
  const type = String(f.type || "string").toLowerCase();
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  if (name.includes("email")) return "customer@example.com";
  if (name.includes("phone") || name.includes("mobile")) return "9999999999";
  if (name.includes("date")) return "2026-01-01";
  return "string";
}
function jsonExample(fields = []) {
  const entries = (fields || []).map(field => {
    const name = typeof field === "string" ? field : field && (field.name || field.field);
    return name ? [String(name), jsonExampleValue(field)] : null;
  }).filter(Boolean);
  return Object.fromEntries(entries);
}
function generateRaml(config, d) {
  let out = `#%RAML 1.0\ntitle: ${d.apiName}\nversion: ${d.apiVersion}\nbaseUri: ${d.basePath}\n`;
  const securityModes = new Set((config.operations || []).map(o => String(o.security || "").toLowerCase()).filter(Boolean));
  if (securityModes.size) {
    out += "\nsecuritySchemes:\n";
    if (securityModes.has("client-id")) out += "  client-id-enforcement:\n    type: Pass Through\n    describedBy:\n      headers:\n        client_id:\n          type: string\n        client_secret:\n          type: string\n";
    if (securityModes.has("oauth2")) out += "  oauth2:\n    type: OAuth 2.0\n    describedBy:\n      headers:\n        Authorization:\n          description: Bearer access token\n          type: string\n";
    if (securityModes.has("basic")) out += "  basic-auth:\n    type: Basic Authentication\n";
  }
  const groups = new Map();
  for (const op of config.operations || []) {
    if (!groups.has(op.path)) groups.set(op.path, []);
    groups.get(op.path).push(op);
  }
  for (const [resource, ops] of groups) for (const op of ops) {
    const method = String(op.method).toLowerCase();
    const code = op.successStatus || (method === "post" ? 201 : 200);
    out += `\n${resource}:\n  ${method}:\n    description: ${op.name || `${op.method} ${op.path}`}\n`;
    if (op.security === "client-id") out += "    securedBy: [client-id-enforcement]\n";
    if (op.security === "oauth2") out += "    securedBy: [oauth2]\n";
    if (op.security === "basic") out += "    securedBy: [basic-auth]\n";
    if (op.pagination) out += `    queryParameters:\n      page:\n        type: integer\n        minimum: 1\n        default: ${Number(op.pagination.defaultPage || 1)}\n      pageSize:\n        type: integer\n        minimum: 1\n        maximum: ${Number(op.pagination.maxPageSize || 100)}\n        default: ${Number(op.pagination.defaultPageSize || 20)}\n`;
    if (op.idempotency) out += "    headers:\n      Idempotency-Key:\n        type: string\n        required: true\n";
    const requestProperties = renderProperties(op.requestFields || [], "            ");
    if (requestProperties) {
      out += "    body:\n      application/json:\n        type: object\n        properties:\n";
      out += requestProperties + "\n";
      out += "        example: " + JSON.stringify(jsonExample(op.requestFields), null, 2).split("\n").map((line, i) => i === 0 ? line : "        " + line).join("\n") + "\n";
    }
    out += `    responses:\n      ${code}:\n        body:\n          application/json:\n            type: object\n`;
    const responseProperties = renderProperties(op.responseFields || [], "            ");
    if (responseProperties) out += "            properties:\n" + responseProperties + "\n";
    if (responseProperties) out += "            example: " + JSON.stringify(jsonExample(op.responseFields), null, 2).split("\n").map((line, i) => i === 0 ? line : "            " + line).join("\n") + "\n";
    for (const err of (op.errors || [])) {
      const status = Number(typeof err === "object" ? (err.status || err.code || 500) : 500);
      const description = typeof err === "object" && err.description ? String(err.description).replace(/\n/g, " ") : "Error response";
      out += `      ${status}:\n        description: ${description}\n        body:\n          application/json:\n            type: object\n`;
    }
  }
  return out + "\n";
}
function namespaces(d) { const ids = new Set(d.connectors.map(c => c.id)); return [d.apiImplementation === "apikit" && "xmlns:apikit=\"http://www.mulesoft.org/schema/mule/mule-apikit\"", ids.has("sftp") && 'xmlns:sftp="http://www.mulesoft.org/schema/mule/sftp"', ids.has("snowflake") && 'xmlns:snowflake="http://www.mulesoft.org/schema/mule/snowflake"', ids.has("anypoint-mq") && 'xmlns:anypoint-mq="http://www.mulesoft.org/schema/mule/anypoint-mq"', ids.has("ibm-mq") && 'xmlns:ibm-mq="http://www.mulesoft.org/schema/mule/ibm-mq"', ids.has("object-store") && 'xmlns:os="http://www.mulesoft.org/schema/mule/os"', ids.has("file") && 'xmlns:file="http://www.mulesoft.org/schema/mule/file"', ids.has("email") && 'xmlns:email="http://www.mulesoft.org/schema/mule/email"', ids.has("jms") && 'xmlns:jms="http://www.mulesoft.org/schema/mule/jms"', ids.has("kafka") && 'xmlns:kafka="http://www.mulesoft.org/schema/mule/kafka"', ids.has("salesforce") && 'xmlns:sfdc="http://www.mulesoft.org/schema/mule/sfdc"'].filter(Boolean).join(" "); }
function schemas(d) { const ids = new Set(d.connectors.map(c => c.id)); const base = ['http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd','http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule.xsd','http://www.mulesoft.org/schema/mule/ee http://www.mulesoft.org/schema/mule/ee/core/mule-ee.xsd']; if (d.apiImplementation === "apikit") base.push("http://www.mulesoft.org/schema/mule/mule-apikit http://www.mulesoft.org/schema/mule/mule-apikit/current/mule-apikit.xsd"); if (d.hasDatabase) base.push('http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd'); if (ids.has("sftp")) base.push('http://www.mulesoft.org/schema/mule/sftp http://www.mulesoft.org/schema/mule/sftp/current/mule-sftp.xsd'); if (ids.has("snowflake")) base.push('http://www.mulesoft.org/schema/mule/snowflake http://www.mulesoft.org/schema/mule/snowflake/current/mule-snowflake.xsd'); if (ids.has("anypoint-mq")) base.push('http://www.mulesoft.org/schema/mule/anypoint-mq http://www.mulesoft.org/schema/mule/anypoint-mq/current/mule-anypoint-mq.xsd'); if (ids.has("ibm-mq")) base.push('http://www.mulesoft.org/schema/mule/ibm-mq http://www.mulesoft.org/schema/mule/ibm-mq/current/mule-ibm-mq.xsd'); if (ids.has("object-store")) base.push('http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd'); if (ids.has("file")) base.push('http://www.mulesoft.org/schema/mule/file http://www.mulesoft.org/schema/mule/file/current/mule-file.xsd'); if (ids.has("email")) base.push('http://www.mulesoft.org/schema/mule/email http://www.mulesoft.org/schema/mule/email/current/mule-email.xsd'); if (ids.has("jms")) base.push('http://www.mulesoft.org/schema/mule/jms http://www.mulesoft.org/schema/mule/jms/current/mule-jms.xsd'); if (ids.has("kafka")) base.push('http://www.mulesoft.org/schema/mule/kafka http://www.mulesoft.org/schema/mule/kafka/current/mule-kafka.xsd'); if (ids.has("salesforce")) base.push('http://www.mulesoft.org/schema/mule/sfdc http://www.mulesoft.org/schema/mule/sfdc/current/mule-sfdc.xsd'); return base.join(" "); }
function generateMuleXml(config, d) { const databaseConfig = d.hasDatabase ? `\n  <db:config name="Database_Config"><db:generic-connection url="${d.databaseUrl}" driverClassName="${d.hasSnowflake ? "net.snowflake.client.jdbc.SnowflakeDriver" : d.databaseDriverClass}" user="${d.databaseUser}" password="${d.databasePassword}" /></db:config>\n` : ""; const ids = new Set(d.connectors.map(c => c.id)); const extraConfigs = [
    ids.has("snowflake") ? `\n  <snowflake:snowflake-config name="Snowflake_Config" user="\${snowflake.user}" password="\${snowflake.password}" account="\${snowflake.account}" warehouse="\${snowflake.warehouse}" database="\${snowflake.database}" schema="\${snowflake.schema}" />\n` : "",
    ids.has("sftp") ? `\n  <sftp:config name="SFTP_Config"><sftp:connection host="\${sftp.host}" port="\${sftp.port}" username="\${sftp.username}" password="\${sftp.password}" /></sftp:config>\n` : "",
    ids.has("anypoint-mq") ? `\n  <anypoint-mq:config name="Anypoint_MQ_Config"><anypoint-mq:connection clientId="\${anypointmq.clientId}" clientSecret="\${anypointmq.clientSecret}" /></anypoint-mq:config>\n` : "",
    ids.has("ibm-mq") ? `\n  <ibm-mq:config name="IBM_MQ_Config"><ibm-mq:connection host="\${ibmmq.host}" port="\${ibmmq.port}" queueManager="\${ibmmq.queueManager}" channel="\${ibmmq.channel}" username="\${ibmmq.username}" password="\${ibmmq.password}" /></ibm-mq:config>\n` : "",
    ids.has("object-store") ? `\n  <os:object-store name="ObjectStore_Config" persistent="true" entryTtl="86400" entryTtlUnit="SECONDS" />\n` : "",
    ids.has("file") ? `\n  <file:config name="File_Config" workingDir="\${file.workingDir}" />\n` : "",
    ids.has("email") ? `\n  <email:smtp-config name="Email_Config" host="\${email.smtp.host}" port="\${email.smtp.port}" user="\${email.smtp.user}" password="\${email.smtp.password}" />\n` : "",
    ids.has("jms") ? `\n  <jms:config name="JMS_Config"><jms:generic-connection /></jms:config>\n` : "",
    ids.has("kafka") ? `\n  <kafka:producer-config name="Kafka_Config" bootstrapServers="\${kafka.bootstrapServers}" />\n` : "",
    ids.has("salesforce") ? `\n  <sfdc:sfdc-config name="Salesforce_Config" username="\${salesforce.username}" password="\${salesforce.password}" securityToken="\${salesforce.securityToken}" />\n` : ""
  ].join(""); const httpConfig = d.workloadType === "api" || (config.operations || []).some(op => op.path && op.method) ? `\n  <http:listener-config name="HTTP_Listener_config"><http:listener-connection host="0.0.0.0" port="\\${http.port}" /></http:listener-config>` : ""; const header = `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:http="http://www.mulesoft.org/schema/mule/http" xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" xmlns:db="http://www.mulesoft.org/schema/mule/db" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${namespaces(d)} xsi:schemaLocation="${schemas(d)}">` + httpConfig + databaseConfig; const flows = d.apiImplementation === "apikit" ? [generateApiKitConfig(d), generateApiKitFlow(d)] : (config.operations || []).map(op => connectorFlow(op, d)).filter(Boolean); const health = config.observability?.health || config.health?.enabled ? generateHealthFlows({ dependencies: config.observability?.dependencies || config.health?.dependencies || [], dependencyChecks: config.observability?.dependencyChecks || config.health?.dependencyChecks || [] }) : ""; return `${header}${extraConfigs}${flows.length ? flows.join("\n") : generateBusinessFlows(config, d)}${health}</mule>\n`; }
function copyProjectToDesktop(root) {
  const desktopCandidates = process.platform === "win32"
    ? [path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "OneDrive", "Desktop")]
    : [path.join(os.homedir(), "Desktop")];
  const desktop = desktopCandidates.find(dir => fs.existsSync(dir));
  if (!desktop) return null;
  const desktopRoot = path.join(desktop, path.basename(root));
  if (path.resolve(desktopRoot) === path.resolve(root)) return desktopRoot;
  if (fs.existsSync(desktopRoot)) fs.rmSync(desktopRoot, { recursive: true, force: true });
  fs.cpSync(root, desktopRoot, { recursive: true });
  return desktopRoot;
}
function generateProject(file = "muleforge.yaml", options = {}) {
  const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)), t = path.resolve(__dirname, "../templates");
  const engineeringPlan = buildEngineeringPlan(config);
  writeEngineeringPlan(root, engineeringPlan);
  const ownershipFile = path.join(root, ".muleforge-generated.json");
  let previousGenerated = [];
  if (fs.existsSync(ownershipFile)) {
    try {
      const ownership = JSON.parse(fs.readFileSync(ownershipFile, "utf8"));
      previousGenerated = Array.isArray(ownership.files) ? ownership.files : [];
      for (const relative of previousGenerated) {
        if (!relative || relative === "muleforge.yaml" || relative === ".muleforge-generated.json") continue;
        const target = path.resolve(root, relative);
        if (target === root || !target.startsWith(root + path.sep) || !fs.existsSync(target)) continue;
        if (fs.statSync(target).isFile()) fs.rmSync(target, { force: true });
      }
    } catch (error) {
      throw new Error("Existing MuleForge generated-file manifest is invalid. Refusing regeneration to avoid deleting the wrong files.");
    }
  }
  const beforeGeneration = new Set(snapshot(root));
  if (d.workloadType === "api" && d.apiImplementation === "apikit") d.connectorDependencies.push({ groupId: "org.mule.modules", artifactId: "mule-apikit-module", version: "1.11.1", classifier: "mule-plugin" });
  write(path.join(root, "pom.xml"), render(fs.readFileSync(path.join(t, "pom.xml.hbs"), "utf8"), d));
  write(path.join(root, "mule-artifact.json"), render(fs.readFileSync(path.join(t, "mule-artifact.json.hbs"), "utf8"), d));
  write(path.join(root, "src/main/resources/application.yaml"), render(fs.readFileSync(path.join(t, "connectors/application.yaml.hbs"), "utf8"), d));
  if (engineeringPlan.workload.ramlRequired) write(path.join(root, "src/main/resources/api", `${d.artifactId}.raml`), generateRaml(config, d));
  write(path.join(root, "src/main/mule", `${d.artifactId}.xml`), generateMuleXml(config, d).replace(/\\n/g, "\n"));
  if ((config.events || config.triggers || []).length) writeEventRuntime(root, config);
  for (const mapping of generateDataWeaveFiles(config)) {
    write(path.join(root, "src/main/resources/dwl", `${mapping.name}-request.dwl`), mapping.request);
    write(path.join(root, "src/main/resources/dwl", `${mapping.name}-response.dwl`), mapping.response);
  }
  if ((config.testing || {}).munit !== false) write(path.join(root, "src/test/munit", `${d.artifactId}-test.xml`), generateMunit(config, d));
  writeProductionArtifacts(root, config, { ...d, workloadType: engineeringPlan.workload.type });
  writeTraceability(root, config);
  deploymentArtifacts(root, config, d);
  const afterGeneration = snapshot(root);
  const newlyGenerated = afterGeneration.filter(relative => !beforeGeneration.has(relative));
  const generated = [...new Set([...previousGenerated.filter(relative => afterGeneration.includes(relative)), ...newlyGenerated])]
    .filter(relative => relative !== ".muleforge-generated.json" && relative !== "muleforge.yaml")
    .sort();
  write(ownershipFile, JSON.stringify({ version: "1.0", files: generated }, null, 2) + "\n");
  const desktopRoot = options.copyDesktop === false ? null : copyProjectToDesktop(root);
  console.log(`\n✔ Mule project generated\n✔ Requirement-derived operations: ${(config.operations || []).length}\n✔ Connectors: ${d.connectors.map(c => c.name).join(", ") || "none"}\n✔ Maven dependencies: ${d.connectorDependencies.length}\n✔ End-to-end Mule XML generated\n✔ Reusable DataWeave mappings generated\n✔ Requirement-derived MUnit scenarios generated\n✔ Postman collection generated\n✔ DEV/QA/UAT/PROD property files generated\n✔ GitHub Actions CI generated\n✔ Local project: ${root}\n${desktopRoot ? `✔ Desktop project: ${desktopRoot}` : "ℹ Desktop folder not found; local project kept only."}\n`);
}

function validate(file = "muleforge.yaml") { const verification = verifyProject(file); const contract = validateContract(file); const model = loadConfig(file); const configuration = validateConfigValues(model); const deployment = validateDeployment(model.deployment || {}); const policies = validateOperationPolicies(model.operations || []); const connectors = auditConnectors(file); const audit = auditProject(file); printReport(verification); console.log("\nContract gate:"); console.log(JSON.stringify(contract, null, 2)); console.log("\nConfiguration gate:"); console.log(JSON.stringify(configuration, null, 2)); console.log("\nDeployment gate:"); console.log(JSON.stringify(deployment, null, 2)); console.log("\nPolicy gate:"); console.log(JSON.stringify(policies, null, 2)); console.log("\nConnector integrity gate:"); console.log(JSON.stringify(connectors, null, 2)); printAudit(audit); if (!verification.ready || !contract.valid || !configuration.valid || !deployment.valid || !policies.valid || !connectors.ready || !audit.ready) process.exitCode = 1; }
function syncDocs(file = "muleforge.yaml") {
  const model = loadConfig(file);
  const root = path.resolve(path.dirname(file));
  writeDocumentation(root, model);
  writeTraceability(root, model);
  console.log("✔ Documentation and traceability synchronized with muleforge.yaml");
}
function mvn(args) { try { execFileSync(process.platform === "win32" ? "mvn.cmd" : "mvn", args, { stdio: "inherit" }); } catch (e) { process.exitCode = e.status || 1; } }

function policyCheck(configFile = "muleforge.yaml") {
  const config = loadConfig(configFile);
  const result = validateOperationPolicies(config.operations || []);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
  return result;
}

function deploymentCheck(configFile = "muleforge.yaml") {
  const config = loadConfig(configFile);
  const result = validateDeployment(config.deployment || {});
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
  return result;
}

function releaseCheck(directory = ".") {
  const root = path.resolve(directory);
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); } catch { add("package.json", false, "package.json must be valid JSON."); }
  add("package version", Boolean(pkg && /^\d+\.\d+\.\d+$/.test(pkg.version || "")), "Package version must use semantic versioning.");
  const lock = fs.existsSync(path.join(root, "package-lock.json")) ? fs.readFileSync(path.join(root, "package-lock.json"), "utf8") : "";
  let lockPackageVersion = null;
  try { lockPackageVersion = JSON.parse(lock).packages?.[""]?.version; } catch {}
  add("lockfile version", Boolean(pkg && lockPackageVersion === pkg.version), "package-lock.json root package version must match package.json.");
  add("README", fs.existsSync(path.join(root, "README.md")), "README.md is required.");
  add("CHANGELOG", fs.existsSync(path.join(root, "CHANGELOG.md")), "CHANGELOG.md is required.");
  add("CI workflow", fs.existsSync(path.join(root, ".github", "workflows", "ci.yml")), "GitHub Actions CI workflow is required.");
  add("release workflow", fs.existsSync(path.join(root, ".github", "workflows", "release.yml")), "Gated release packaging workflow is required.");
  add("runtime validation workflow", fs.existsSync(path.join(root, ".github", "workflows", "runtime-validation.yml")), "Manual Maven/MUnit runtime validation workflow is required.");
  add("runtime validation docs", fs.existsSync(path.join(root, "docs", "cicd", "runtime-validation.md")), "Runtime validation documentation is required.");
  const workflowDir = path.join(root, ".github", "workflows");
  const workflowFiles = fs.existsSync(workflowDir) ? fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name)) : [];
  add("workflow syntax", workflowFiles.length > 0 && workflowFiles.every(name => {
    try { YAML.parse(fs.readFileSync(path.join(workflowDir, name), "utf8")); return true; } catch { return false; }
  }), "GitHub Actions workflow files must be parseable YAML.");
  const sourceVersion = (() => {
    try { return String(fs.readFileSync(path.join(root, "src", "index.js"), "utf8").match(/const VERSION = "([^"]+)"/)?.[1] || ""); } catch { return ""; }
  })();
  add("CLI version sync", Boolean(pkg && sourceVersion === pkg.version), "src/index.js CLI version must match package.json.");
  const changelog = fs.existsSync(path.join(root, "CHANGELOG.md")) ? fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8") : "";
  add("changelog version", Boolean(pkg && changelog.includes(pkg.version)), "CHANGELOG.md must contain the current package version.");
  add("tests", fs.existsSync(path.join(root, "test")), "Automated tests are required.");
  add("generator template", fs.existsSync(path.join(root, "templates", "pom.xml.hbs")), "Generated Maven template is required.");  add("connector audit", fs.existsSync(path.join(root, "src", "connector-audit.js")), "Connector integrity audit is required.");
  add("MUnit scenario generator", fs.existsSync(path.join(root, "src", "munit-generator.js")), "MUnit scenario generation is required.");
  add("breaking-change checker", fs.existsSync(path.join(root, "src", "breaking-check.js")), "API compatibility checker is required.");
  add("RAML schema generator", fs.existsSync(path.join(root, "src", "schema-generator.js")), "Detailed RAML request/response schema generation is required.");
  add("gitignore", fs.existsSync(path.join(root, ".gitignore")), ".gitignore is required.");
  const forbidden = [];
  const scan = dir => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
      if ([".git","node_modules","target"].includes(e.name)) continue;
      const p = path.join(dir,e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(js|json|yaml|yml|xml|properties|md)$/.test(e.name)) {
        const s = fs.readFileSync(p,"utf8");
        if (/(?:password|client[_-]?secret|access[_-]?token|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{12,}/i.test(s)) forbidden.push(path.relative(root,p));
      }
    }
  };
  scan(root);
  add("release secret scan", forbidden.length === 0, forbidden.length ? "Potential hard-coded credential in: " + forbidden.join(", ") : "No obvious hard-coded credentials detected.");
  return { ready: checks.every(c => c.pass), checks };
}

function doctor() {
  console.log("\n🚀 MuleForge Doctor\n");

  const resolveCommand = (name, fallback = null) => {
    if (process.platform !== "win32") return name;
    if (fallback && fs.existsSync(fallback)) return fallback;

    const pathEntries = String(process.env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean);

    const candidates = [name];
    if (!path.extname(name)) candidates.push(`${name}.exe`, `${name}.cmd`, `${name}.bat`);

    for (const entry of pathEntries) {
      for (const candidate of candidates) {
        const full = path.join(entry, candidate);
        if (fs.existsSync(full)) return full;
      }
    }

    return null;
  };

  const commands = process.platform === "win32"
    ? {
        node: process.execPath,
        java: resolveCommand("java", process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java.exe") : null),
        mvn: resolveCommand("mvn", process.env.MAVEN_HOME ? path.join(process.env.MAVEN_HOME, "bin", "mvn.cmd") : null),
        git: resolveCommand("git")
      }
    : { node: "node", java: "java", mvn: "mvn", git: "git" };

  for (const [name, command] of Object.entries(commands)) {
    if (!command) {
      console.log(`✖ ${name} not found`);
      continue;
    }

    try {
      execFileSync(command, ["--version"], { stdio: "inherit" });
      console.log(`✔ ${name}`);
    } catch {
      console.log(`✖ ${name} not found`);
    }
  }
}
async function collectRequirementFiles(input) {
  const supported = new Set([".pdf",".docx",".pptx",".xlsx",".txt",".md",".markdown",".csv",".json",".yaml",".yml",".html",".htm",".raml",".xml",".dwl",".sql",".properties"]);
  const ignoredDirectories = new Set([".git","node_modules","target",".mule",".settings",".idea",".vscode"]);
  const ignoredFiles = new Set(["muleforge.yaml","muleforge.yml","package.json","package-lock.json"]);
  const root = path.resolve(input);
  if (!fs.existsSync(root)) throw new Error("Requirement input not found: " + input);
  const files = [];
  const walk = file => {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      if (ignoredDirectories.has(path.basename(file))) return;
      for (const entry of fs.readdirSync(file, { withFileTypes: true })) walk(path.join(file, entry.name));
      return;
    }
    if (supported.has(path.extname(file).toLowerCase()) && !ignoredFiles.has(path.basename(file))) files.push(file);
  };
  walk(root);
  return files.sort();
}
function analyzeDocument(file, projectName) {
  const input = path.resolve(file);
  const stat = fs.statSync(input);
  const files = stat.isDirectory() ? collectRequirementFiles(input) : [input];
  if (!files.length) throw new Error("No supported requirement or API documentation files found: " + file);
  const documents = files.map(source => {
    const extracted = extractDocumentBuffer(fs.readFileSync(source), path.basename(source));
    return {
      name: path.relative(process.cwd(), source).replace(/\\/g, "/"),
      type: extracted.type,
      text: extracted.text
    };
  });
  const model = analyzeRequirementDocument(documents.map(d => d.text).join("\n\n"), documents[0].name, documents);
  if (projectName) {
    model.project.name = projectName;
    model.project.artifactId = projectName;
    model.api.name = projectName;
  }
  const root = path.resolve(process.cwd(), model.project.name);
  if (fs.existsSync(root)) throw new Error(`Project already exists: ${model.project.name}`);
  fs.mkdirSync(root, { recursive: true });
  write(path.join(root, "muleforge.yaml"), YAML.stringify(model));
  writeDocumentation(root, model);
  generateProject(path.join(root, "muleforge.yaml"));
  console.log(`✔ Requirement package analyzed locally: ${files.length} source file(s)`);
  console.log(`✔ Requirements: ${model.requirements.length}; operations: ${model.operations.length}; conflicts: ${model.conflicts.length}`);
  console.log(`✔ Project created: ${root}`);
}
function initProject(name = "mule-api") { const project = String(name).trim(); if (!/^[A-Za-z0-9._-]+$/.test(project)) throw new Error("Project name may contain only letters, numbers, dot, underscore and hyphen"); const root = path.resolve(process.cwd(), project); if (fs.existsSync(root)) throw new Error(`Project already exists: ${project}`); fs.mkdirSync(root, { recursive: true }); const model = { requirement: `Initialize a Mule 4 API project named ${project}.`, project: { name: project, artifactId: project, groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" }, api: { name: project, version: "v1", type: "System API", specification: "RAML", basePath: "/api/v1" }, connectors: ["http"], operations: [{ name: "get_health", method: "GET", path: "/health", requestFields: [], responseFields: ["status"], validation: [], successStatus: 200, errors: ["Unexpected errors return 500"] }], decisions: [], testing: { munit: true }, deployment: { target: "cloudhub2" } }; write(path.join(root, "muleforge.yaml"), YAML.stringify(model)); writeDocumentation(root, model); generateProject(path.join(root, "muleforge.yaml")); console.log(`✔ Initialized ${project}`); }
program.name("muleforge").description("Open-source CLI for requirement-driven Mule 4 project generation").version(VERSION); registerCreate(program); program.command("init <name>").description("Initialize and generate a complete Mule 4 project skeleton").action(initProject); program.command("analyze <document-or-directory> [project]").description("Analyze one document or a repository requirement/documentation directory and generate the complete Mule solution").action((file, project) => analyzeDocument(file, project).catch(e => { console.error(`\n❌ ${e.message}`); process.exitCode = 1; })); program.command("generate [config]").description("Generate files from muleforge.yaml").option("--no-desktop", "Generate locally without copying the project to Desktop").action((config = "muleforge.yaml", options) => generateProject(config, { copyDesktop: options.desktop })); program.command("validate [config]").description("Validate generated project and requirement coverage").action((config = "muleforge.yaml") => validate(config)); program.command("verify [config]").description("Verify requirement coverage and generated project quality").option("--build", "Run Maven tests when static verification passes").action((config = "muleforge.yaml", options) => { const report = verifyProject(config, options); printReport(report); if (!report.ready) process.exitCode = 1; }); program.command("build").description("Build the Mule application with Maven").action(() => mvn(["clean", "package"])); program.command("test").description("Run Maven tests").action(() => mvn(["test"])); program.command("clean").description("Clean Maven output").action(() => mvn(["clean"])); program.command("doctor").description("Check local development tools").action(doctor); program.command("release-check [directory]").description("Run release-readiness checks without modifying the project").action((directory=".") => { const report = releaseCheck(directory); console.log(JSON.stringify(report,null,2)); if (!report.ready) process.exitCode=1; }); program.command("runtime-check [directory]").description("Check Java, Maven and Mule project prerequisites without modifying the project").action(runtimeCheck); program.command("audit [config]").description("Run the MuleForge project quality audit").action((config = "muleforge.yaml") => { const report = auditProject(config); printAudit(report); if (!report.ready) process.exitCode = 1; }); program.command("governance-check [config]").description("Validate API naming, paths, methods, schemas, status codes, security and error contracts").action((config="muleforge.yaml")=>{const r=validateApiGovernance(loadConfig(config));console.log(JSON.stringify(r,null,2));if(!r.valid)process.exitCode=1;}); program.command("compatibility-check [config] [directory]").description("Validate declared Java/Mule runtime compatibility and generated pom alignment").action((config="muleforge.yaml",directory=".")=>{const r=checkRuntimeCompatibility(loadConfig(config),directory);console.log(JSON.stringify(r,null,2));if(!r.valid)process.exitCode=1;}); program.command("environment-diff <from> <to>").description("Compare two MuleForge YAML environments without exposing sensitive values").action((from,to)=>console.log(JSON.stringify(environmentDiff(from,to),null,2))); program.command("config-check [config]").description("Validate declared configuration defaults and required values").action((config = "muleforge.yaml") => { const r = validateConfigValues(loadConfig(config)); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode = 1; }); program.command("contract-check [config]").description("Validate API operation contracts before generation").action((config = "muleforge.yaml") => { const r = validateContract(config); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode=1; }); program.command("policy-check [config]").description("Validate reliability, pagination, idempotency, transaction and security policies").action((config = "muleforge.yaml") => { const r = validateOperationPolicies(loadConfig(config).operations || []); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode=1; }); program.command("deployment-check [config]").description("Validate deployment target and release settings").action((config = "muleforge.yaml") => { const r = validateDeployment(loadConfig(config).deployment || {}); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode=1; }); program.command("connector-check [config]").description("Audit connector dependencies, namespaces, configurations and generated operations").action((config = "muleforge.yaml") => { const r = auditConnectors(config); console.log(JSON.stringify(r,null,2)); if (!r.ready) process.exitCode=1; }); program.command("repair [directory]").description("Safely create missing non-destructive project scaffolding").option("--verify","Verify, repair, then re-verify without destructive changes").option("--build","Run Maven tests when verification is requested").action((directory=".",options) => { const report=options.verify ? repairAndVerify(directory,{build:options.build,maxPasses:2}) : repairProject(directory); console.log(JSON.stringify(report,null,2)); if(options.verify && !report.ready) process.exitCode=1; }); program.command("inspect-project [directory]").description("Analyze an existing Mule project without modifying it").action((directory = ".") => printInspection(inspectProject(directory))); program.command("deploy-config [config]").description("Generate safe CloudHub 2.0 and Runtime Fabric deployment templates").action((config = "muleforge.yaml") => { const model = loadConfig(config), d = context(model), root = path.resolve(path.dirname(config)); deploymentArtifacts(root, model, d); console.log("✔ Deployment templates generated in .github/workflows/ and docs/09-deployment/"); }); program.command("sync-docs [config]").description("Regenerate application documentation and traceability from muleforge.yaml").action((config = "muleforge.yaml") => syncDocs(config)); program.command("trace [config]").description("Generate requirement-to-asset traceability").action((config = "muleforge.yaml") => { const model = loadConfig(config), root = path.resolve(path.dirname(config)); writeTraceability(root, model); console.log("✔ Traceability generated in muleforge-traceability.json and docs/11-traceability.md"); }); program.command("postman [config]").description("Generate a Postman collection from the project model").action((file = "muleforge.yaml") => { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)); writeProductionArtifacts(root, config, d); console.log("✔ Postman collection generated in postman/"); }); program.command("cicd [config]").description("Generate CI/CD environment files and GitHub Actions workflow").action((file = "muleforge.yaml") => { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)); writeProductionArtifacts(root, config, d); console.log("✔ CI/CD assets generated in .github/workflows/ and src/main/resources/properties/"); }); program.command("ui").description("Open the local MuleForge web workspace").option("-p, --port <port>", "Local port", "4173").action(({ port }) => startUi(Number(port))); program.command("diff [directory]").description("Show added, removed and unchanged project files against a saved snapshot").option("--save <file>", "Save the current snapshot to a JSON file").option("--from <file>", "Compare the project with a JSON snapshot").action((directory = ".", options) => {
  const files = snapshot(directory);
  if (options.save) {
    write(path.resolve(options.save), JSON.stringify({ root: path.resolve(directory), files }, null, 2) + "\n");
    console.log(`✔ Snapshot saved: ${path.resolve(options.save)}`);
    return;
  }
  if (!options.from) {
    console.log(JSON.stringify({ root: path.resolve(directory), files }, null, 2));
    return;
  }
  const saved = JSON.parse(fs.readFileSync(path.resolve(options.from), "utf8"));
  const diff = diffSnapshots(saved.files || [], files);
  console.log(JSON.stringify(diff, null, 2));
});


program.command("event-check [config]").description("Validate event and messaging trigger definitions").action((config="muleforge.yaml")=>{const r=validateEventModel(buildEventModel(loadConfig(config)));console.log(JSON.stringify(r,null,2));if(!r.valid)process.exitCode=1;});
program.command("pipeline-plan [config]").description("Generate a portable CI/CD pipeline model").action((config="muleforge.yaml")=>{const m=pipelineModel(loadConfig(config));console.log(JSON.stringify(m,null,2));for(const t of m.targets)console.log("\n"+renderPipeline(m,t));});
program.command("soap-scaffold [config]").description("Generate a reviewable SOAP/WSDL scaffold when a WSDL source is declared").action((config="muleforge.yaml")=>{const model=loadConfig(config),root=path.resolve(path.dirname(config)),r=writeSoapScaffold(root,model);console.log(r?"✔ SOAP/WSDL scaffold created":"No WSDL declared; nothing generated.");});
program.command("graphql [config]").description("Generate a GraphQL schema scaffold from the project model").action((config="muleforge.yaml")=>{const model=loadConfig(config),root=path.resolve(path.dirname(config));console.log("✔ GraphQL schema written to "+writeGraphql(root,model));});
program.command("artifact-keygen [directory]").description("Generate an Ed25519 signing key pair").action((directory=".")=>console.log(JSON.stringify(generateSigningKeys(directory),null,2)));
program.command("artifact-sign [directory]").description("Sign an existing artifact manifest with an Ed25519 private key").option("--key <file>","Private key PEM").action((directory=".",options)=>console.log("✔ Artifact manifest signed: "+signManifest(directory,options.key)));
program.command("artifact-verify [directory]").description("Verify an artifact manifest Ed25519 signature").option("--key <file>","Public key PEM").action((directory=".",options)=>{const r=verifyManifest(directory,options.key);console.log(JSON.stringify(r,null,2));if(!r.verified)process.exitCode=1;});
program.command("ide-manifest [directory]").description("Generate IDE integration metadata without modifying source semantics").action((directory=".")=>console.log("✔ IDE manifest written to "+writeIdeManifest(directory)));
program.command("dependency-audit [directory]").description("Run available dependency vulnerability audits").action((directory=".")=>{const r=dependencyAudit(directory);console.log(JSON.stringify(r,null,2));if(r.available&&!r.passed)process.exitCode=1;});
program.command("artifact-manifest [directory]").description("Generate SHA-256 artifact provenance manifest").action((directory=".")=>console.log("✔ Artifact manifest written to "+writeManifest(directory)));
program.command("dataweave-check [directory]").description("Validate generated DataWeave scripts before runtime execution").action((directory=".")=>{const r=validateDirectory(directory);console.log(JSON.stringify(r,null,2));if(!r.valid)process.exitCode=1;});
program.command("dataweave-run <file>").description("Execute DataWeave only when the official CLI is installed").option("--input <file>","JSON input file").option("--expected <file>","Expected JSON output").action((file,options)=>{const script=fs.readFileSync(path.resolve(file),"utf8"),input=options.input?JSON.parse(fs.readFileSync(path.resolve(options.input),"utf8")):null,r=executeDataWeave(script,input);if(options.expected&&r.executed){r.expected=JSON.parse(fs.readFileSync(path.resolve(options.expected),"utf8"));r.matches=compareExpected(r.stdout,r.expected);if(!r.matches)process.exitCode=1;}console.log(JSON.stringify(r,null,2));});
program.command("golden-test [directory]").description("Run MuleForge golden generation regression fixtures").action((directory=".")=>{const r=writeGoldenReport(directory);console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;});
program.command("ci-native <target> [directory]").description("Generate a native CI template for gitlab, azure-devops, jenkins or bitbucket").action((target,directory=".")=>console.log("✔ Native CI template written to "+writeNative(directory,target)));
program.command("dataweave-validate <file>").description("Validate one DataWeave script").action(file=>{const r=validateScript(fs.readFileSync(path.resolve(file),"utf8"));console.log(JSON.stringify(r,null,2));if(!r.valid)process.exitCode=1;});
program.command("import [directory]").description("Reverse-engineer an existing Mule project into a reviewable MuleForge model").action((directory=".")=>{const r=writeImportedModel(directory);console.log("✔ Imported model written to "+r.target);console.log(JSON.stringify(r.model,null,2));});
program.command("reconcile [config] [directory]").description("Reconcile confirmed requirements against an existing Mule repository without duplicating or overwriting source assets").action((config="muleforge.yaml",directory=".")=>{const r=writeReconciliation(config,directory);console.log(JSON.stringify(r,null,2));if(r.summary.missing || r.summary.connectorDrift) process.exitCode=1;});
program.command("readiness [config] [directory]").description("Aggregate existing MuleForge engineering gates into one lifecycle readiness report").action((config="muleforge.yaml",directory=".")=>{const r=writeReadiness(config,directory);console.log(JSON.stringify(r,null,2));if(r.summary.status==="action-required") process.exitCode=1;});
program.command("plan [config]").description("Classify the MuleSoft workload and produce one end-to-end developer engineering plan").action((config="muleforge.yaml")=>{const model=loadConfig(config),root=path.resolve(path.dirname(config)),r=writeEngineeringPlan(root,buildEngineeringPlan(model));console.log(JSON.stringify(r.plan,null,2));if(r.plan.workload.developerActionRequired)process.exitCode=1;});
program.command("explain [directory]").description("Explain an existing Mule project using imported semantics without modifying its source").action((directory=".")=>{const model=importProject(directory),plan=explainImportedProject(model);console.log(JSON.stringify(plan,null,2));});
program.command("db-migration <from> <to> [directory]").description("Generate reviewable SQL for schema drift between two JSON schema models").action((from,to,directory=".")=>{const a=JSON.parse(fs.readFileSync(path.resolve(from),"utf8")),b=JSON.parse(fs.readFileSync(path.resolve(to),"utf8"));const {writeSchemaMigration}=require("./db-schema");console.log("✔ Migration written to "+writeSchemaMigration(directory,a,b));});
program.command("promotion-plan [config]").description("Generate an environment promotion and rollback plan").action((config="muleforge.yaml")=>{const model=loadConfig(config),root=path.resolve(path.dirname(config));console.log("✔ Promotion plan written to "+writePromotionPlan(root,model));});
program.command("ir-check [config]").description("Validate the semantic integration model").action((config="muleforge.yaml")=>{const r=validateIntegrationIR(buildIntegrationIR(loadConfig(config)));console.log(JSON.stringify(r,null,2));if(!r.valid)process.exitCode=1;});
program.command("security-scan [directory]").description("Scan source for hard-coded secrets and report dependency inventory").action((directory=".")=>{const root=path.resolve(directory),r={secrets:scanSecrets(root),dependencies:scanDependencies(root)};console.log(JSON.stringify(r,null,2));if(r.secrets.length)process.exitCode=1;});
program.command("sbom [directory]").description("Generate a CycloneDX SBOM for Node dependencies").action((directory=".")=>{write(path.join(path.resolve(directory),"bom.json"),JSON.stringify(sbom(path.resolve(directory)),null,2)+"\n");console.log("✔ SBOM written to bom.json");});
program.command("openapi [config]").description("Generate an OpenAPI 3.0 contract from the project model").option("--version <version>","OpenAPI version","3.0.3").action((config="muleforge.yaml",options)=>{const model=loadConfig(config),root=path.resolve(path.dirname(config)),name=model.project?.artifactId||model.project?.name||"mule-api";write(path.join(root,"src/main/resources/api",name+".openapi.yaml"),openApiYaml(model,{version:options.version}));console.log("✔ OpenAPI contract generated");});
program.command("runtime-test [directory]").description("Run Maven tests and optionally start Mule and probe an HTTP endpoint").option("--start","Start the Mule application after tests").option("--url <url>","HTTP URL to probe").option("--timeout <ms>","Readiness timeout","60000").action(async(directory=".",options)=>{const r=await runtimeTest(directory,options);console.log(JSON.stringify(r,null,2));if(!r.build||(options.start&&!r.ready))process.exitCode=1;});
program.command("contract-diff <from> [to]").description("Show semantic API contract changes between two MuleForge models").action((from,to="muleforge.yaml")=>{const r=runBreakingCheck(from,to);console.log(JSON.stringify(r,null,2));});
program.command("breaking-check <from> [to]").description("Detect potentially breaking API contract changes between two muleforge.yaml files").action((from, to = "muleforge.yaml") => { const r = runBreakingCheck(from, to); console.log(JSON.stringify(r, null, 2)); if (r.breaking) process.exitCode = 1; });

program.command("self-test").description("Run local generation, contract, connector, verification and audit smoke gates").action(() => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-self-test-"));
  try {
    const root = path.join(temp, "self-test"); fs.mkdirSync(root, { recursive: true });
    const model = { requirement: "Self-test requirement", project: { name: "self-test", artifactId: "self-test", groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" }, api: { name: "Self Test", version: "v1", basePath: "/api/v1" }, connectors: ["http"], operations: [{ name: "health", method: "GET", path: "/health", connector: "http", requestFields: [{ name: "name", type: "string" }, { name: "email", type: "string" }], responseFields: [{ name: "status", type: "string" }], successStatus: 200 }], testing: { munit: true }, deployment: { target: "none" } };
    const cfg = path.join(root, "muleforge.yaml"); write(cfg, YAML.stringify(model)); generateProject(cfg, { copyDesktop: false });
    const contract = validateContract(cfg), deployment = validateDeployment(model.deployment || {}), policies = validateOperationPolicies(model.operations || []), connectors = auditConnectors(cfg), verification = verifyProject(cfg), audit = auditProject(cfg);
    if (!contract.valid || !deployment.valid || !policies.valid || !connectors.ready || !verification.ready || !audit.ready) { printReport(verification); printAudit(audit); throw new Error("Self-test quality gates failed."); }
    console.log("✔ Self-test passed: generation, contract, verification and audit gates are green.");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
program.parseAsync().catch(e => { console.error(`\n❌ ${e.message}`); process.exitCode = 1; });