#!/usr/bin/env node
const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");
const YAML = require("yaml");
const { buildConnectorDependencies, resolveConnectors } = require("./connectors");
const { registerCreate } = require("./create-command");
const { readRequirementDocument, analyzeRequirementDocument } = require("./document-analyzer");
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
const { repairProject } = require("./repair");
const { snapshot, diffSnapshots } = require("./diff");
const { renderProperties } = require("./schema-generator");
const VERSION = "0.9.7";
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
function context(config) { const p = config.project || {}, a = config.api || {}, db = config.database || {}; const requested = [...(config.connectors || []), ...(db.type === "snowflake" ? ["database"] : [])]; if (requested.some(c => String(c).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-") === "snowflake")) requested.push("database"); const connectors = resolveConnectors(requested); const snowflake = db.type === "snowflake" || connectors.some(c => c.id === "snowflake"); return { projectName: p.name || "mule-api", artifactId: p.artifactId || p.name || "mule-api", groupId: p.groupId || "com.example", version: p.version || "1.0.0", muleRuntime: p.muleRuntime || "4.9.0", java: p.java || "17", apiName: a.name || p.name || "Mule API", apiVersion: a.version || "v1", basePath: a.basePath || "/api/v1", connectors, connectorDependencies: buildConnectorDependencies(config, config.connectorVersions || config.connectors?.versions || {}), hasSnowflake: snowflake, hasDatabase: Boolean(db.type) || snowflake || connectors.some(c => c.id === "database"), databaseType: db.type || (snowflake ? "snowflake" : ""), databaseTable: db.table || "CUSTOMER", databaseUrl: db.url || "${db.url}", databaseUser: db.user || "${db.user}", databasePassword: db.password || "${db.password}", hasSftp: connectors.some(c => c.id === "sftp") }; }
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
    }
    out += `    responses:\n      ${code}:\n        body:\n          application/json:\n            type: object\n`;
    const responseProperties = renderProperties(op.responseFields || [], "            ");
    if (responseProperties) out += "            properties:\n" + responseProperties + "\n";
    for (const err of (op.errors || [])) {
      const status = Number(typeof err === "object" ? (err.status || err.code || 500) : 500);
      const description = typeof err === "object" && err.description ? String(err.description).replace(/\n/g, " ") : "Error response";
      out += `      ${status}:\n        description: ${description}\n        body:\n          application/json:\n            type: object\n`;
    }
  }
  return out + "\n";
}
function namespaces(d) { const ids = new Set(d.connectors.map(c => c.id)); return [ids.has("sftp") && 'xmlns:sftp="http://www.mulesoft.org/schema/mule/sftp"', ids.has("snowflake") && 'xmlns:snowflake="http://www.mulesoft.org/schema/mule/snowflake"', ids.has("anypoint-mq") && 'xmlns:anypoint-mq="http://www.mulesoft.org/schema/mule/anypoint-mq"', ids.has("ibm-mq") && 'xmlns:ibm-mq="http://www.mulesoft.org/schema/mule/ibm-mq"', ids.has("object-store") && 'xmlns:os="http://www.mulesoft.org/schema/mule/os"', ids.has("file") && 'xmlns:file="http://www.mulesoft.org/schema/mule/file"', ids.has("email") && 'xmlns:email="http://www.mulesoft.org/schema/mule/email"', ids.has("jms") && 'xmlns:jms="http://www.mulesoft.org/schema/mule/jms"', ids.has("kafka") && 'xmlns:kafka="http://www.mulesoft.org/schema/mule/kafka"', ids.has("salesforce") && 'xmlns:sfdc="http://www.mulesoft.org/schema/mule/sfdc"'].filter(Boolean).join(" "); }
function schemas(d) { const ids = new Set(d.connectors.map(c => c.id)); const base = ['http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd','http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule.xsd','http://www.mulesoft.org/schema/mule/ee http://www.mulesoft.org/schema/mule/ee/core/mule-ee.xsd']; if (d.hasDatabase) base.push('http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd'); if (ids.has("sftp")) base.push('http://www.mulesoft.org/schema/mule/sftp http://www.mulesoft.org/schema/mule/sftp/current/mule-sftp.xsd'); if (ids.has("snowflake")) base.push('http://www.mulesoft.org/schema/mule/snowflake http://www.mulesoft.org/schema/mule/snowflake/current/mule-snowflake.xsd'); if (ids.has("anypoint-mq")) base.push('http://www.mulesoft.org/schema/mule/anypoint-mq http://www.mulesoft.org/schema/mule/anypoint-mq/current/mule-anypoint-mq.xsd'); if (ids.has("ibm-mq")) base.push('http://www.mulesoft.org/schema/mule/ibm-mq http://www.mulesoft.org/schema/mule/ibm-mq/current/mule-ibm-mq.xsd'); if (ids.has("object-store")) base.push('http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd'); if (ids.has("file")) base.push('http://www.mulesoft.org/schema/mule/file http://www.mulesoft.org/schema/mule/file/current/mule-file.xsd'); if (ids.has("email")) base.push('http://www.mulesoft.org/schema/mule/email http://www.mulesoft.org/schema/mule/email/current/mule-email.xsd'); if (ids.has("jms")) base.push('http://www.mulesoft.org/schema/mule/jms http://www.mulesoft.org/schema/mule/jms/current/mule-jms.xsd'); if (ids.has("kafka")) base.push('http://www.mulesoft.org/schema/mule/kafka http://www.mulesoft.org/schema/mule/kafka/current/mule-kafka.xsd'); if (ids.has("salesforce")) base.push('http://www.mulesoft.org/schema/mule/sfdc http://www.mulesoft.org/schema/mule/sfdc/current/mule-sfdc.xsd'); return base.join(" "); }
function generateMuleXml(config, d) { const databaseConfig = d.hasDatabase ? `\n  <db:config name="Database_Config"><db:generic-connection url="\${d.databaseUrl}" driverClassName="${d.hasSnowflake ? "net.snowflake.client.jdbc.SnowflakeDriver" : ""}" user="\${d.databaseUser}" password="\${d.databasePassword}" /></db:config>\n` : ""; const ids = new Set(d.connectors.map(c => c.id)); const extraConfigs = [
    ids.has("snowflake") ? `\n  <snowflake:snowflake-config name="Snowflake_Config" user="\${snowflake.user}" password="\${snowflake.password}" account="\${snowflake.account}" warehouse="\${snowflake.warehouse}" database="\${snowflake.database}" schema="\${snowflake.schema}" />\n` : "",
    ids.has("sftp") ? `\n  <sftp:config name="SFTP_Config"><sftp:connection host="\${sftp.host}" port="\${sftp.port}" username="\${sftp.username}" password="\${sftp.password}" /></sftp:config>\n` : "",
    ids.has("anypoint-mq") ? `\n  <anypoint-mq:config name="Anypoint_MQ_Config"><anypoint-mq:connection clientId="\${anypointmq.clientId}" clientSecret="\${anypointmq.clientSecret}" /></anypoint-mq:config>\n` : "",
    ids.has("ibm-mq") ? `\n  <ibm-mq:config name="IBM_MQ_Config"><ibm-mq:connection host="\${ibmmq.host}" port="\${ibmmq.port}" queueManager="\${ibmmq.queueManager}" channel="\${ibmmq.channel}" username="\${ibmmq.username}" password="\${ibmmq.password}" /></ibm-mq:config>\n` : "",
    ids.has("object-store") ? `\n  <os:object-store name="ObjectStore_Config" persistent="false" />\n` : "",
    ids.has("file") ? `\n  <file:config name="File_Config" workingDir="\${file.workingDir}" />\n` : "",
    ids.has("email") ? `\n  <email:smtp-config name="Email_Config" host="\${email.smtp.host}" port="\${email.smtp.port}" user="\${email.smtp.user}" password="\${email.smtp.password}" />\n` : "",
    ids.has("jms") ? `\n  <jms:config name="JMS_Config"><jms:generic-connection /></jms:config>\n` : "",
    ids.has("kafka") ? `\n  <kafka:producer-config name="Kafka_Config" bootstrapServers="\${kafka.bootstrapServers}" />\n` : "",
    ids.has("salesforce") ? `\n  <sfdc:sfdc-config name="Salesforce_Config" username="\${salesforce.username}" password="\${salesforce.password}" securityToken="\${salesforce.securityToken}" />\n` : ""
  ].join(""); const header = `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:http="http://www.mulesoft.org/schema/mule/http" xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" xmlns:db="http://www.mulesoft.org/schema/mule/db" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${namespaces(d)} xsi:schemaLocation="${schemas(d)}">\n  <http:listener-config name="HTTP_Listener_config"><http:listener-connection host="0.0.0.0" port="\${http.port}" /></http:listener-config>${databaseConfig}`; const flows = (config.operations || []).map(op => connectorFlow(op, d)).filter(Boolean); return `${header}${extraConfigs}${flows.length ? flows.join("\n") : generateBusinessFlows(config, d)}</mule>\n`; }
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
function generateProject(file = "muleforge.yaml", options = {}) { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)), t = path.resolve(__dirname, "../templates"); write(path.join(root, "pom.xml"), render(fs.readFileSync(path.join(t, "pom.xml.hbs"), "utf8"), d)); write(path.join(root, "mule-artifact.json"), render(fs.readFileSync(path.join(t, "mule-artifact.json.hbs"), "utf8"), d)); write(path.join(root, "src/main/resources/application.yaml"), render(fs.readFileSync(path.join(t, "connectors/application.yaml.hbs"), "utf8"), d)); write(path.join(root, "src/main/resources/api", `${d.artifactId}.raml`), generateRaml(config, d)); write(path.join(root, "src/main/mule", `${d.artifactId}.xml`), generateMuleXml(config, d).replace(/\\n/g, "\n")); for (const mapping of generateDataWeaveFiles(config)) { write(path.join(root, "src/main/resources/dwl", `${mapping.name}-request.dwl`), mapping.request); write(path.join(root, "src/main/resources/dwl", `${mapping.name}-response.dwl`), mapping.response); } if ((config.testing || {}).munit !== false) write(path.join(root, "src/test/munit", `${d.artifactId}-test.xml`), generateMunit(config, d)); writeProductionArtifacts(root, config, d); writeTraceability(root, config); deploymentArtifacts(root, config, d);   const desktopRoot = options.copyDesktop === false ? null : copyProjectToDesktop(root);   console.log(`\n✔ Mule project generated\n✔ Requirement-derived operations: ${(config.operations || []).length}\n✔ Connectors: ${d.connectors.map(c => c.name).join(", ") || "none"}\n✔ Maven dependencies: ${d.connectorDependencies.length}\n✔ End-to-end Mule XML generated\n✔ Reusable DataWeave mappings generated\n✔ Requirement-derived MUnit scenarios generated\n✔ Postman collection generated\n✔ DEV/QA/UAT/PROD property files generated\n✔ GitHub Actions CI generated\n✔ Local project: ${root}\n${desktopRoot ? `✔ Desktop project: ${desktopRoot}` : "ℹ Desktop folder not found; local project kept only."}\n`); }
function validate(file = "muleforge.yaml") { const verification = verifyProject(file); const contract = validateContract(file); const model = loadConfig(file); const deployment = validateDeployment(model.deployment || {}); const policies = validateOperationPolicies(model.operations || []); const connectors = auditConnectors(file); const audit = auditProject(file); printReport(verification); console.log("\nContract gate:"); console.log(JSON.stringify(contract, null, 2)); console.log("\nDeployment gate:"); console.log(JSON.stringify(deployment, null, 2)); console.log("\nPolicy gate:"); console.log(JSON.stringify(policies, null, 2)); console.log("\nConnector integrity gate:"); console.log(JSON.stringify(connectors, null, 2)); printAudit(audit); if (!verification.ready || !contract.valid || !deployment.valid || !policies.valid || !connectors.ready || !audit.ready) process.exitCode = 1; }
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
  add("tests", fs.existsSync(path.join(root, "test")), "Automated tests are required.");
  add("generator template", fs.existsSync(path.join(root, "templates", "pom.xml.hbs")), "Generated Maven template is required.");
  add("connector audit", fs.existsSync(path.join(root, "src", "connector-audit.js")), "Connector integrity audit is required.");
  add("MUnit scenario generator", fs.existsSync(path.join(root, "src", "munit-generator.js")), "MUnit scenario generation is required.");
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
async function analyzeDocument(file, projectName) { const text = readRequirementDocument(file); const model = analyzeRequirementDocument(text, file); if (projectName) { model.project.name = projectName; model.project.artifactId = projectName; model.api.name = projectName; } const root = path.resolve(process.cwd(), model.project.name); if (fs.existsSync(root)) throw new Error(`Project already exists: ${model.project.name}`); fs.mkdirSync(root, { recursive: true }); write(path.join(root, "muleforge.yaml"), YAML.stringify(model)); writeDocumentation(root, model); generateProject(path.join(root, "muleforge.yaml")); console.log(`✔ Requirement document analyzed locally: ${file}`); console.log(`✔ Project created: ${root}`); }
function initProject(name = "mule-api") { const project = String(name).trim(); if (!/^[A-Za-z0-9._-]+$/.test(project)) throw new Error("Project name may contain only letters, numbers, dot, underscore and hyphen"); const root = path.resolve(process.cwd(), project); if (fs.existsSync(root)) throw new Error(`Project already exists: ${project}`); fs.mkdirSync(root, { recursive: true }); const model = { requirement: `Initialize a Mule 4 API project named ${project}.`, project: { name: project, artifactId: project, groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" }, api: { name: project, version: "v1", type: "System API", specification: "RAML", basePath: "/api/v1" }, connectors: ["http"], operations: [{ name: "get_health", method: "GET", path: "/health", requestFields: [], responseFields: ["status"], validation: [], successStatus: 200, errors: ["Unexpected errors return 500"] }], decisions: [], testing: { munit: true }, deployment: { target: "cloudhub2" } }; write(path.join(root, "muleforge.yaml"), YAML.stringify(model)); writeDocumentation(root, model); generateProject(path.join(root, "muleforge.yaml")); console.log(`✔ Initialized ${project}`); }
program.name("muleforge").description("Open-source CLI for requirement-driven Mule 4 project generation").version(VERSION); registerCreate(program); program.command("init <name>").description("Initialize and generate a complete Mule 4 project skeleton").action(initProject); program.command("analyze <document> [project]").description("Analyze a local requirement document and generate the complete Mule solution without external services").action((file, project) => analyzeDocument(file, project).catch(e => { console.error(`\n❌ ${e.message}`); process.exitCode = 1; })); program.command("generate [config]").description("Generate files from muleforge.yaml").action((config = "muleforge.yaml") => generateProject(config)); program.command("validate [config]").description("Validate generated project and requirement coverage").action((config = "muleforge.yaml") => validate(config)); program.command("verify [config]").description("Verify requirement coverage and generated project quality").option("--build", "Run Maven tests when static verification passes").action((config = "muleforge.yaml", options) => { const report = verifyProject(config, options); printReport(report); if (!report.ready) process.exitCode = 1; }); program.command("build").description("Build the Mule application with Maven").action(() => mvn(["clean", "package"])); program.command("test").description("Run Maven tests").action(() => mvn(["test"])); program.command("clean").description("Clean Maven output").action(() => mvn(["clean"])); program.command("doctor").description("Check local development tools").action(doctor); program.command("release-check [directory]").description("Run release-readiness checks without modifying the project").action((directory=".") => { const report = releaseCheck(directory); console.log(JSON.stringify(report,null,2)); if (!report.ready) process.exitCode=1; }); program.command("runtime-check [directory]").description("Check Java, Maven and Mule project prerequisites without modifying the project").action(runtimeCheck); program.command("audit [config]").description("Run the MuleForge project quality audit").action((config = "muleforge.yaml") => { const report = auditProject(config); printAudit(report); if (!report.ready) process.exitCode = 1; }); program.command("contract-check [config]").description("Validate API operation contracts before generation").action((config = "muleforge.yaml") => { const r = validateContract(config); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode=1; }); program.command("policy-check [config]").description("Validate reliability, pagination, idempotency, transaction and security policies").action((config = "muleforge.yaml") => { const r = validateOperationPolicies(loadConfig(config).operations || []); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode=1; }); program.command("deployment-check [config]").description("Validate deployment target and release settings").action((config = "muleforge.yaml") => { const r = validateDeployment(loadConfig(config).deployment || {}); console.log(JSON.stringify(r,null,2)); if (!r.valid) process.exitCode=1; }); program.command("connector-check [config]").description("Audit connector dependencies, namespaces, configurations and generated operations").action((config = "muleforge.yaml") => { const r = auditConnectors(config); console.log(JSON.stringify(r,null,2)); if (!r.ready) process.exitCode=1; }); program.command("repair [directory]").description("Safely create missing non-destructive project scaffolding").action((directory=".") => console.log(JSON.stringify(repairProject(directory),null,2))); program.command("inspect-project [directory]").description("Analyze an existing Mule project without modifying it").action((directory = ".") => printInspection(inspectProject(directory))); program.command("deploy-config [config]").description("Generate safe CloudHub 2.0 and Runtime Fabric deployment templates").action((config = "muleforge.yaml") => { const model = loadConfig(config), d = context(model), root = path.resolve(path.dirname(config)); deploymentArtifacts(root, model, d); console.log("✔ Deployment templates generated in .github/workflows/ and docs/09-deployment/"); }); program.command("sync-docs [config]").description("Regenerate application documentation and traceability from muleforge.yaml").action((config = "muleforge.yaml") => syncDocs(config)); program.command("trace [config]").description("Generate requirement-to-asset traceability").action((config = "muleforge.yaml") => { const model = loadConfig(config), root = path.resolve(path.dirname(config)); writeTraceability(root, model); console.log("✔ Traceability generated in muleforge-traceability.json and docs/11-traceability.md"); }); program.command("postman [config]").description("Generate a Postman collection from the project model").action((file = "muleforge.yaml") => { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)); writeProductionArtifacts(root, config, d); console.log("✔ Postman collection generated in postman/"); }); program.command("cicd [config]").description("Generate CI/CD environment files and GitHub Actions workflow").action((file = "muleforge.yaml") => { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)); writeProductionArtifacts(root, config, d); console.log("✔ CI/CD assets generated in .github/workflows/ and src/main/resources/properties/"); }); program.command("ui").description("Open the local MuleForge web workspace").option("-p, --port <port>", "Local port", "4173").action(({ port }) => startUi(Number(port))); program.command("diff [directory]").description("Show added, removed and unchanged project files against a saved snapshot").option("--save <file>", "Save the current snapshot to a JSON file").option("--from <file>", "Compare the project with a JSON snapshot").action((directory = ".", options) => {
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

program.command("self-test").description("Run local generation, contract, connector, verification and audit smoke gates").action(() => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-self-test-"));
  try {
    const root = path.join(temp, "self-test"); fs.mkdirSync(root, { recursive: true });
    const model = { requirement: "Self-test requirement", project: { name: "self-test", artifactId: "self-test", groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" }, api: { name: "Self Test", version: "v1", basePath: "/api/v1" }, connectors: ["http"], operations: [{ name: "health", method: "GET", path: "/health", connector: "http", responseFields: ["status"], successStatus: 200 }], testing: { munit: true }, deployment: { target: "none" } };
    const cfg = path.join(root, "muleforge.yaml"); write(cfg, YAML.stringify(model)); generateProject(cfg, { copyDesktop: false });
    const contract = validateContract(cfg), deployment = validateDeployment(model.deployment || {}), policies = validateOperationPolicies(model.operations || []), connectors = auditConnectors(cfg), verification = verifyProject(cfg), audit = auditProject(cfg);
    if (!contract.valid || !deployment.valid || !policies.valid || !connectors.ready || !verification.ready || !audit.ready) { printReport(verification); printAudit(audit); throw new Error("Self-test quality gates failed."); }
    console.log("✔ Self-test passed: generation, contract, verification and audit gates are green.");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
program.parseAsync().catch(e => { console.error(`\n❌ ${e.message}`); process.exitCode = 1; });
