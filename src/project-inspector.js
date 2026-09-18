const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if ([".git", "target", "node_modules"].includes(entry.name)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function inspectProject(root = ".") {
  const absolute = path.resolve(root);
  const files = walk(absolute);
  const rel = files.map(f => path.relative(absolute, f).replace(/\\/g, "/"));
  const xml = rel.filter(f => f.endsWith(".xml"));
  const dw = rel.filter(f => f.endsWith(".dwl"));
  const raml = rel.filter(f => f.endsWith(".raml"));
  const munit = rel.filter(f => /munit/i.test(f) && f.endsWith(".xml"));
  const configs = rel.filter(f => /application.*\.(yaml|yml|properties)$/.test(f));
  const pom = files.find(f => path.basename(f) === "pom.xml");
  const pomText = pom ? fs.readFileSync(pom, "utf8") : "";
  const connectors = ["http","database","sftp","ibm-mq","anypoint-mq","kafka","jms","email","file","salesforce","snowflake","object-store"]
    .filter(id => pomText.toLowerCase().includes(id.replace("ibm-mq","ibm-mq").replace("anypoint-mq","anypoint-mq")));
  const modelFile = files.find(f => path.basename(f) === "muleforge.yaml");
  let model = null;
  if (modelFile) {
    try { model = YAML.parse(fs.readFileSync(modelFile, "utf8")) || null; } catch {}
  }
  const issues = [];
  const security = { envFiles: configs.length, suspiciousSecretFiles: rel.filter(f => /(^|\/)(\.env|.*secret.*|.*credential.*)$/i.test(f)) };
  if (!pom) issues.push("Missing pom.xml");
  if (!raml.length) issues.push("No RAML specification found");
  if (!xml.length) issues.push("No Mule XML flows found");
  if (!munit.length) issues.push("No MUnit suite found");
  if (!dw.length) issues.push("No DataWeave files found");
  return {
    project: path.basename(absolute),
    files: rel.length,
    muleXml: xml.length,
    raml: raml.length,
    dataWeave: dw.length,
    munit: munit.length,
    environmentConfigs: configs.length,
    connectors,
    hasMuleForgeModel: Boolean(model),
    operations: model && Array.isArray(model.operations) ? model.operations.length : null,
    issues,
    security,
    readyForMigrationReview: issues.length === 0
  };
}

function printInspection(report) {
  console.log("\n🔎 MuleForge Existing Project Analysis\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(report.readyForMigrationReview ? "\n✓ Project has the expected core Mule assets.\n" : "\n⚠ Project needs review before migration/generation.\n");
}
module.exports = { inspectProject, printInspection };
