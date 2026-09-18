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
const VERSION = "0.7.0";
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
function loadConfig(file = "muleforge.yaml") { const full = path.resolve(file); if (!fs.existsSync(full)) throw new Error(`Configuration not found: ${file}`); return YAML.parse(fs.readFileSync(full, "utf8")) || {}; }
function context(config) { const p = config.project || {}, a = config.api || {}, db = config.database || {}; const requested = [...(config.connectors || []), ...(db.type === "snowflake" ? ["database"] : [])]; if (requested.some(c => String(c).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-") === "snowflake")) requested.push("database"); const connectors = resolveConnectors(requested); const snowflake = db.type === "snowflake" || connectors.some(c => c.id === "snowflake"); return { projectName: p.name || "mule-api", artifactId: p.artifactId || p.name || "mule-api", groupId: p.groupId || "com.example", version: p.version || "1.0.0", muleRuntime: p.muleRuntime || "4.9.0", java: p.java || "17", apiName: a.name || p.name || "Mule API", apiVersion: a.version || "v1", basePath: a.basePath || "/api/v1", connectors, connectorDependencies: buildConnectorDependencies(config, config.connectorVersions || config.connectors?.versions || {}), hasSnowflake: snowflake, hasDatabase: Boolean(db.type) || snowflake || connectors.some(c => c.id === "database"), databaseType: db.type || (snowflake ? "snowflake" : ""), databaseTable: db.table || "CUSTOMER", databaseUrl: db.url || "${db.url}", databaseUser: db.user || "${db.user}", databasePassword: db.password || "${db.password}", hasSftp: connectors.some(c => c.id === "sftp") }; }
function generateRaml(config, d) { let out = `#%RAML 1.0\ntitle: ${d.apiName}\nversion: ${d.apiVersion}\nbaseUri: ${d.basePath}\n\n`; const groups = new Map(); for (const op of config.operations || []) { if (!groups.has(op.path)) groups.set(op.path, []); groups.get(op.path).push(op); } for (const [resource, ops] of groups) for (const op of ops) { const code = op.successStatus || (String(op.method).toUpperCase() === "POST" ? 201 : 200); out += `${resource}:\n  ${String(op.method).toLowerCase()}:\n    description: ${op.name || `${op.method} ${op.path}`}\n    responses:\n      ${code}:\n        body:\n          application/json:\n            type: object\n`; } return out; }
function namespaces(d) { const ids = new Set(d.connectors.map(c => c.id)); return [ids.has("sftp") && 'xmlns:sftp="http://www.mulesoft.org/schema/mule/sftp"', ids.has("anypoint-mq") && 'xmlns:anypoint-mq="http://www.mulesoft.org/schema/mule/anypoint-mq"', ids.has("ibm-mq") && 'xmlns:ibm-mq="http://www.mulesoft.org/schema/mule/ibm-mq"', ids.has("object-store") && 'xmlns:os="http://www.mulesoft.org/schema/mule/os"', ids.has("file") && 'xmlns:file="http://www.mulesoft.org/schema/mule/file"', ids.has("email") && 'xmlns:email="http://www.mulesoft.org/schema/mule/email"', ids.has("jms") && 'xmlns:jms="http://www.mulesoft.org/schema/mule/jms"', ids.has("kafka") && 'xmlns:kafka="http://www.mulesoft.org/schema/mule/kafka"', ids.has("salesforce") && 'xmlns:sfdc="http://www.mulesoft.org/schema/mule/sfdc"'].filter(Boolean).join(" "); }
function schemas(d) { const ids = new Set(d.connectors.map(c => c.id)); const base = ['http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd','http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule.xsd','http://www.mulesoft.org/schema/mule/ee http://www.mulesoft.org/schema/mule/ee/core/mule-ee.xsd']; if (d.hasDatabase) base.push('http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd'); if (ids.has("sftp")) base.push('http://www.mulesoft.org/schema/mule/sftp http://www.mulesoft.org/schema/mule/sftp/current/mule-sftp.xsd'); if (ids.has("anypoint-mq")) base.push('http://www.mulesoft.org/schema/mule/anypoint-mq http://www.mulesoft.org/schema/mule/anypoint-mq/current/mule-anypoint-mq.xsd'); if (ids.has("ibm-mq")) base.push('http://www.mulesoft.org/schema/mule/ibm-mq http://www.mulesoft.org/schema/mule/ibm-mq/current/mule-ibm-mq.xsd'); if (ids.has("object-store")) base.push('http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd'); if (ids.has("file")) base.push('http://www.mulesoft.org/schema/mule/file http://www.mulesoft.org/schema/mule/file/current/mule-file.xsd'); if (ids.has("email")) base.push('http://www.mulesoft.org/schema/mule/email http://www.mulesoft.org/schema/mule/email/current/mule-email.xsd'); if (ids.has("jms")) base.push('http://www.mulesoft.org/schema/mule/jms http://www.mulesoft.org/schema/mule/jms/current/mule-jms.xsd'); if (ids.has("kafka")) base.push('http://www.mulesoft.org/schema/mule/kafka http://www.mulesoft.org/schema/mule/kafka/current/mule-kafka.xsd'); if (ids.has("salesforce")) base.push('http://www.mulesoft.org/schema/mule/sfdc http://www.mulesoft.org/schema/mule/sfdc/current/mule-sfdc.xsd'); return base.join(" "); }
function generateMuleXml(config, d) { const databaseConfig = d.hasDatabase ? `\n  <db:config name="Database_Config"><db:generic-connection url="\${d.databaseUrl}" driverClassName="${d.hasSnowflake ? "net.snowflake.client.jdbc.SnowflakeDriver" : ""}" user="\${d.databaseUser}" password="\${d.databasePassword}" /></db:config>\n` : ""; const header = `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:http="http://www.mulesoft.org/schema/mule/http" xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" xmlns:db="http://www.mulesoft.org/schema/mule/db" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${namespaces(d)} xsi:schemaLocation="${schemas(d)}">\n  <http:listener-config name="HTTP_Listener_config"><http:listener-connection host="0.0.0.0" port="\${http.port}" /></http:listener-config>${databaseConfig}`; const flows = (config.operations || []).map(op => connectorFlow(op, d)).filter(Boolean); return `${header}${flows.length ? flows.join("\n") : generateBusinessFlows(config, d)}</mule>\n`; }
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
function generateProject(file = "muleforge.yaml") { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)), t = path.resolve(__dirname, "../templates"); write(path.join(root, "pom.xml"), render(fs.readFileSync(path.join(t, "pom.xml.hbs"), "utf8"), d)); write(path.join(root, "mule-artifact.json"), render(fs.readFileSync(path.join(t, "mule-artifact.json.hbs"), "utf8"), d)); write(path.join(root, "src/main/resources/application.yaml"), render(fs.readFileSync(path.join(t, "connectors/application.yaml.hbs"), "utf8"), d)); write(path.join(root, "src/main/resources/api", `${d.artifactId}.raml`), generateRaml(config, d)); write(path.join(root, "src/main/mule", `${d.artifactId}.xml`), generateMuleXml(config, d)); for (const mapping of generateDataWeaveFiles(config)) { write(path.join(root, "src/main/resources/dwl", `${mapping.name}-request.dwl`), mapping.request); write(path.join(root, "src/main/resources/dwl", `${mapping.name}-response.dwl`), mapping.response); } if ((config.testing || {}).munit !== false) write(path.join(root, "src/test/munit", `${d.artifactId}-test.xml`), generateMunit(config, d)); writeProductionArtifacts(root, config, d); writeTraceability(root, config); deploymentArtifacts(root, config, d);   const desktopRoot = copyProjectToDesktop(root);   console.log(`\n✔ Mule project generated\n✔ Requirement-derived operations: ${(config.operations || []).length}\n✔ Connectors: ${d.connectors.map(c => c.name).join(", ") || "none"}\n✔ Maven dependencies: ${d.connectorDependencies.length}\n✔ End-to-end Mule XML generated\n✔ Reusable DataWeave mappings generated\n✔ Requirement-derived MUnit scenarios generated\n✔ Postman collection generated\n✔ DEV/QA/UAT/PROD property files generated\n✔ GitHub Actions CI generated\n✔ Local project: ${root}\n${desktopRoot ? `✔ Desktop project: ${desktopRoot}` : "ℹ Desktop folder not found; local project kept only."}\n`); }
function validate(file = "muleforge.yaml") { const report = verifyProject(file); printReport(report); if (!report.ready) process.exitCode = 1; }
function mvn(args) { try { execFileSync(process.platform === "win32" ? "mvn.cmd" : "mvn", args, { stdio: "inherit" }); } catch (e) { process.exitCode = e.status || 1; } }
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
function initProject(name = "mule-api") { const project = String(name).trim(); if (!/^[A-Za-z0-9._-]+$/.test(project)) throw new Error("Project name may contain only letters, numbers, dot, underscore and hyphen"); const root = path.resolve(process.cwd(), project); if (fs.existsSync(root)) throw new Error(`Project already exists: ${project}`); fs.mkdirSync(root, { recursive: true }); const model = { requirement: `Initialize a Mule 4 API project named ${project}.`, project: { name: project, artifactId: project, groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" }, api: { name: project, version: "v1", type: "System API", specification: "RAML", basePath: "/api/v1" }, connectors: ["http"], operations: [{ name: "get_health", method: "GET", path: "/health", requestFields: [], responseFields: ["status"], validation: [], successStatus: 200, errors: ["Unexpected errors return 500"] }], decisions: [], testing: { munit: true }, deployment: { target: "none" } }; write(path.join(root, "muleforge.yaml"), YAML.stringify(model)); writeDocumentation(root, model); generateProject(path.join(root, "muleforge.yaml")); console.log(`✔ Initialized ${project}`); }
program.name("muleforge").description("Open-source CLI for requirement-driven Mule 4 project generation").version(VERSION); registerCreate(program); program.command("init <name>").description("Initialize and generate a complete Mule 4 project skeleton").action(initProject); program.command("analyze <document> [project]").description("Analyze a local requirement document and generate the complete Mule solution without external services").action((file, project) => analyzeDocument(file, project).catch(e => { console.error(`\n❌ ${e.message}`); process.exitCode = 1; })); program.command("generate [config]").description("Generate files from muleforge.yaml").action((config = "muleforge.yaml") => generateProject(config)); program.command("validate [config]").description("Validate generated project and requirement coverage").action((config = "muleforge.yaml") => validate(config)); program.command("verify [config]").description("Verify requirement coverage and generated project quality").option("--build", "Run Maven tests when static verification passes").action((config = "muleforge.yaml", options) => { const report = verifyProject(config, options); printReport(report); if (!report.ready) process.exitCode = 1; }); program.command("build").description("Build the Mule application with Maven").action(() => mvn(["clean", "package"])); program.command("test").description("Run Maven tests").action(() => mvn(["test"])); program.command("clean").description("Clean Maven output").action(() => mvn(["clean"])); program.command("doctor").description("Check local development tools").action(doctor); program.command("audit [config]").description("Run the MuleForge project quality audit").action((config = "muleforge.yaml") => { const report = auditProject(config); printAudit(report); if (!report.ready) process.exitCode = 1; }); program.command("deploy-config [config]").description("Generate safe CloudHub 2.0 and Runtime Fabric deployment templates").action((config = "muleforge.yaml") => { const model = loadConfig(config), d = context(model), root = path.resolve(path.dirname(config)); deploymentArtifacts(root, model, d); console.log("✔ Deployment templates generated in .github/workflows/ and docs/09-deployment/"); }); program.command("trace [config]").description("Generate requirement-to-asset traceability").action((config = "muleforge.yaml") => { const model = loadConfig(config), root = path.resolve(path.dirname(config)); writeTraceability(root, model); console.log("✔ Traceability generated in muleforge-traceability.json and docs/11-traceability.md"); }); program.command("postman [config]").description("Generate a Postman collection from the project model").action((file = "muleforge.yaml") => { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)); writeProductionArtifacts(root, config, d); console.log("✔ Postman collection generated in postman/"); }); program.command("cicd [config]").description("Generate CI/CD environment files and GitHub Actions workflow").action((file = "muleforge.yaml") => { const config = loadConfig(file), d = context(config), root = path.resolve(path.dirname(file)); writeProductionArtifacts(root, config, d); console.log("✔ CI/CD assets generated in .github/workflows/ and src/main/resources/properties/"); }); program.command("ui").description("Open the local MuleForge web workspace").option("-p, --port <port>", "Local port", "4173").action(({ port }) => startUi(Number(port))); program.parseAsync().catch(e => { console.error(`\n❌ ${e.message}`); process.exitCode = 1; });
