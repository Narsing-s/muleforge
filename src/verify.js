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
  checks.push(result("Maven project", Boolean(pom && /<project[\s>]/.test(pom)), "pom.xml must contain a Maven project."));
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
    checks.push(result("Mule XML declaration", mule.startsWith("<?xml"), "Mule XML should contain an XML declaration."));
    checks.push(result("Mule root", /<mule\b/.test(mule) && /<\/mule>\s*$/.test(mule), "Mule XML must have a mule root element."));
    checks.push(result("HTTP listener config", /<http:listener-config\b/.test(mule), "An HTTP listener configuration is expected for HTTP APIs."));
    for (const op of operations) {
      const expectedPath = `${api.basePath || ""}${op.path || ""}`;
      const listener = new RegExp(`<http:listener\\b[^>]*path=["']${expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ["']`, "i");
      const pathPresent = mule.includes(`path="${expectedPath}"`) || mule.includes(`path='${expectedPath}'`);
      const methodPresent = mule.includes(`allowedMethods="${String(op.method).toUpperCase()}"`) || mule.includes(`allowedMethods='${String(op.method).toUpperCase()}'`);
      checks.push(result(`Mule operation ${String(op.method).toUpperCase()} ${op.path}`, Boolean(pathPresent && methodPresent), "Generated Mule listener must match the confirmed operation."));
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
