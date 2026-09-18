const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const YAML = require("yaml");

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
  const checks = [];

  checks.push(result("Requirement exists", Boolean(config.requirement && String(config.requirement).trim()), "muleforge.yaml must contain the confirmed requirement."));
  checks.push(result("Project metadata", Boolean(project.name), "project.name is required."));
  checks.push(result("API metadata", Boolean(api.name && api.basePath), "api.name and api.basePath are required."));
  checks.push(result("Operations defined", operations.length > 0, "At least one confirmed API operation is required."));
  checks.push(result("No unresolved document conflicts", !Array.isArray(config.conflicts) || config.conflicts.length === 0, "Conflicting source documents must be resolved before generation is considered ready."));
  checks.push(result("Required connectivity configuration", !Array.isArray(config.missingConfigurations) || config.missingConfigurations.length === 0, "Required non-secret connectivity values must be explicitly resolved; credentials may remain environment placeholders."));
  checks.push(result("Operation connector mapping", operations.every(op => (op.connector || !(Array.isArray(config.connectors) && config.connectors.length)) && !op.connectorAmbiguous), "Every analyzed operation must have one unambiguous connector mapping; legacy/reference configs without explicit connector metadata use HTTP as the default source."));
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
  checks.push(result("Application configuration", Boolean(application), "application.yaml is required."));
  checks.push(result("RAML exists", Boolean(raml), `Expected ${ramlPath}.`));
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
        values.every(value => mule.includes(value)),
        'Every explicit non-secret connectivity value from the requirement package must appear in the generated Mule configuration.'
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
    const expectedOperationFlowNames = operations.map(op => artifactId + "-" + String(op.name || "").replace(/[^A-Za-z0-9_-]/g, "-") + "-flow");
    checks.push(result("Unique generated operation flow names", new Set(expectedOperationFlowNames).size === expectedOperationFlowNames.length, "Operation names must remain unique after Mule flow-name sanitization."));
    const operationFlowsChecked = operations.map(op => ({
      name: `${artifactId}-${String(op.name || "").replace(/[^A-Za-z0-9_-]/g, "-")}-flow`,
      block: flowBlocks.find(m => m[1] === `${artifactId}-${String(op.name || "").replace(/[^A-Za-z0-9_-]/g, "-")}-flow`)?.[0] || ""
    }));
    checks.push(result("Flow error handling", operationFlowsChecked.every(x => /<error-handler>/.test(x.block)), "Every generated operation flow must contain its own error handler."));
    checks.push(result("Generated operation flow names", operationFlowsChecked.every(x => flowNames.has(x.name)), "Every configured operation must map to a generated Mule flow."));
    checks.push(result("HTTP listener config", /<http:listener-config\b/.test(mule), "An HTTP listener configuration is expected for HTTP APIs."));
    for (const op of operations) {
      const expectedPath = `${api.basePath || ""}${op.path || ""}`;
      const pathPresent = op.schedule ? /<scheduler\b/.test(mule) : (mule.includes(`path="${expectedPath}"`) || mule.includes(`path='${expectedPath}'`));
      const methodPresent = op.schedule ? true : (mule.includes(`allowedMethods="${String(op.method).toUpperCase()}"`) || mule.includes(`allowedMethods='${String(op.method).toUpperCase()}'`));
      const sourcePresent = op.schedule ? /<scheduler\b/.test(mule) : Boolean(pathPresent && methodPresent);
      const connector = String(op.connector || "").toLowerCase().replace(/_/g, "-");
      const destinationPresent = connector === "ibm-mq" || connector === "anypoint-mq" ? mule.includes(`destination="${op.destination || ""}"`) : true;
      const filePresent = connector === "sftp" && op.filePath ? mule.includes(`path="${op.filePath}"`) : true;
      checks.push(result(`Mule operation ${String(op.method).toUpperCase()} ${op.path}`, Boolean(sourcePresent && destinationPresent && filePresent), "Generated source and documented connector destination/path must match the confirmed operation."));
    }
  }

  if ((config.testing || {}).munit !== false) {
    const munit = safeRead(root, munitPath);
    checks.push(result("MUnit scaffold", Boolean(munit), `Expected ${munitPath}.`));
  }

  for (const op of operations) {
    for (const field of op.requestFields || []) {
      const mentioned = raml.includes(String(field)) || mule.includes(String(field));
      checks.push(result(`Request field ${field}`, mentioned, "Request field should be represented in the generated API or implementation."));
    }
    if (op.successStatus) {
      checks.push(result(`Success status ${op.name}`, raml.includes(String(op.successStatus)), "Confirmed success status should appear in the RAML contract."));
    }
  }

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
