#!/usr/bin/env node

const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const YAML = require("yaml");
const Handlebars = require("handlebars");

const VERSION = "0.2.0";
const program = new Command();

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function render(template, data) {
  return Handlebars.compile(template, { noEscape: true })(data);
}

function loadConfig(configPath = "muleforge.yaml") {
  const full = path.resolve(configPath);
  if (!fs.existsSync(full)) throw new Error(`Configuration not found: ${configPath}`);
  return YAML.parse(fs.readFileSync(full, "utf8")) || {};
}

function context(config) {
  const project = config.project || {};
  const api = config.api || {};
  return {
    projectName: project.name || "mule-api",
    artifactId: project.artifactId || project.name || "mule-api",
    groupId: project.groupId || "com.example",
    version: project.version || "1.0.0",
    muleRuntime: project.muleRuntime || "4.9.0",
    apiName: api.name || project.name || "Mule API",
    apiVersion: api.version || "v1",
    basePath: api.basePath || "/api/v1"
  };
}

async function ask(question, defaultValue) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question}${defaultValue ? ` [${defaultValue}]` : ""}: `);
  rl.close();
  return answer.trim() || defaultValue;
}

async function choose(question, values, defaultIndex = 0) {
  console.log(`\n${question}`);
  values.forEach((value, index) => console.log(`  ${index === defaultIndex ? "❯" : " "} ${index + 1}. ${value}`));
  const answer = await ask("Select number", String(defaultIndex + 1));
  const index = Number(answer) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= values.length) throw new Error("Invalid selection");
  return values[index];
}

async function multiChoose(question, values, defaults = []) {
  console.log(`\n${question}`);
  values.forEach((value, index) => console.log(`  ${defaults.includes(index) ? "[x]" : "[ ]"} ${index + 1}. ${value}`));
  const answer = await ask("Select numbers separated by commas", defaults.map((i) => i + 1).join(","));
  const indexes = answer.split(",").map((v) => Number(v.trim()) - 1).filter((v) => Number.isInteger(v) && v >= 0 && v < values.length);
  return [...new Set(indexes)].map((i) => values[i]);
}

async function interactiveConfig() {
  console.log("\n🚀 MuleForge Interactive Setup\n");
  const name = await ask("Project name", "customer-api");
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("Project name may contain only letters, numbers, dots, underscores and hyphens");
  const apiType = await choose("API type", ["System API", "Process API", "Experience API"]);
  const runtime = await ask("Mule runtime", "4.9.0");
  const java = await choose("Java version", ["17", "21"]);
  const database = await choose("Database", ["None", "Snowflake", "MySQL", "PostgreSQL"]);
  const connectors = await multiChoose("Connectors", ["HTTP", "Database", "Snowflake", "SFTP", "IBM MQ", "Anypoint MQ", "Object Store"], [0]);
  const munit = (await choose("Testing", ["MUnit", "No tests"])) === "MUnit";
  const deployment = await choose("Deployment target", ["None", "CloudHub", "CloudHub 2.0"]);

  return {
    project: { name, artifactId: name, groupId: "com.example", version: "1.0.0", muleRuntime: runtime, java },
    api: { name, version: "v1", type: apiType, specification: "RAML", basePath: "/api/v1" },
    database: { type: database.toLowerCase() },
    connectors: connectors.map((v) => v.toLowerCase().replace(/ /g, "-")),
    testing: { munit },
    deployment: { target: deployment.toLowerCase().replace(/ /g, "") },
    operations: [
      { name: "getCustomer", method: "GET", path: "/customers/{customerId}" },
      { name: "createCustomer", method: "POST", path: "/customers" }
    ]
  };
}

function generateRaml(config, data) {
  const operations = config.operations || [];
  let raml = `#%RAML 1.0\ntitle: ${data.apiName}\nversion: ${data.apiVersion}\nbaseUri: ${data.basePath}\n\n`;
  const grouped = new Map();
  for (const op of operations) {
    const key = op.path;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(op);
  }
  for (const [resource, ops] of grouped) {
    raml += `${resource}:\n`;
    for (const op of ops) {
      raml += `  ${String(op.method).toLowerCase()}:\n    description: ${op.name}\n    responses:\n      200:\n        body:\n          application/json:\n            type: object\n`;
    }
  }
  return raml;
}

function generateMuleXml(config, data) {
  const operations = config.operations || [];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:http="http://www.mulesoft.org/schema/mule/http" xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">\n`;
  xml += `  <http:listener-config name="HTTP_Listener_config"><http:listener-connection host="0.0.0.0" port="\${http.port}" /></http:listener-config>\n`;
  for (const op of operations) {
    const name = `${data.artifactId}-${op.name}`.replace(/[^A-Za-z0-9_-]/g, "-");
    const endpoint = `${data.basePath}${op.path}`;
    xml += `  <flow name="${name}-flow">\n    <http:listener config-ref="HTTP_Listener_config" path="${endpoint}" allowedMethods="${op.method}" />\n    <logger level="INFO" message="MuleForge operation: ${op.name}" />\n    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n{ message: "MuleForge generated operation", operation: "${op.name}", method: "${op.method}" }]]></ee:set-payload></ee:message></ee:transform>\n  </flow>\n`;
  }
  return `${xml}</mule>\n`;
}

function generateProject(configPath = "muleforge.yaml") {
  const config = loadConfig(configPath);
  const data = context(config);
  const root = path.resolve(path.dirname(configPath));
  const templates = path.resolve(__dirname, "../templates");
  const pom = fs.readFileSync(path.join(templates, "pom.xml.hbs"), "utf8");
  const artifact = fs.readFileSync(path.join(templates, "mule-artifact.json.hbs"), "utf8");
  const munit = fs.readFileSync(path.join(templates, "munit/basic-test.xml.hbs"), "utf8");

  write(path.join(root, "pom.xml"), render(pom, data));
  write(path.join(root, "mule-artifact.json"), render(artifact, data));
  write(path.join(root, "src/main/resources/application.yaml"), `http:\n  port: 8081\n\napi:\n  name: ${data.apiName}\n  version: ${data.apiVersion}\n`);
  write(path.join(root, "src/main/resources/api", `${data.artifactId}.raml`), generateRaml(config, data));
  write(path.join(root, "src/main/mule", `${data.artifactId}.xml`), generateMuleXml(config, data));
  if ((config.testing || {}).munit !== false) write(path.join(root, "src/test/munit", `${data.artifactId}-test.xml`), render(munit, data));

  console.log("\n✔ Generated pom.xml\n✔ Generated mule-artifact.json\n✔ Generated RAML\n✔ Generated Mule flows\n✔ Generated application.yaml");
  if ((config.testing || {}).munit !== false) console.log("✔ Generated MUnit test");
  console.log("\n🎉 Project generated successfully.\n");
}

function validate(configPath = "muleforge.yaml") {
  const config = loadConfig(configPath);
  const data = context(config);
  const root = path.resolve(path.dirname(configPath));
  const required = ["pom.xml", "mule-artifact.json", "src/main/resources/application.yaml", `src/main/resources/api/${data.artifactId}.raml`, `src/main/mule/${data.artifactId}.xml`];
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
  console.log("\n🚀 MuleForge Validator\n");
  console.log(`✔ Project: ${data.projectName}`);
  console.log(`✔ Runtime: ${data.muleRuntime}`);
  if (missing.length) {
    missing.forEach((file) => console.log(`✖ Missing: ${file}`));
    process.exitCode = 1;
    return;
  }
  console.log("✔ Maven project\n✔ Mule artifact\n✔ RAML\n✔ Mule implementation\n✔ Application properties\n\nValidation successful.\n");
}

function runMaven(args) {
  try { execFileSync(process.platform === "win32" ? "mvn.cmd" : "mvn", args, { stdio: "inherit" }); }
  catch (error) { process.exitCode = error.status || 1; }
}

function doctor() {
  console.log("\n🚀 MuleForge Doctor\n");
  for (const command of ["node", "java", "mvn", "git"]) {
    try { execFileSync(process.platform === "win32" ? `${command}.cmd` : command, ["--version"], { stdio: "inherit" }); console.log(`✔ ${command}`); }
    catch { console.log(`✖ ${command} not found`); }
  }
}

program.name("muleforge").description("Open-source Mule 4 API project generator").version(VERSION);

program.command("init [projectName]")
  .description("Create a MuleForge project; omit projectName for interactive setup")
  .option("--runtime <version>", "Mule runtime version", "4.9.0")
  .option("--group <groupId>", "Maven groupId", "com.example")
  .action(async (projectName, options) => {
    const config = projectName ? {
      project: { name: projectName, artifactId: projectName, groupId: options.group, version: "1.0.0", muleRuntime: options.runtime },
      api: { name: projectName, version: "v1", type: "System API", specification: "RAML", basePath: "/api/v1" },
      database: { type: "none" }, connectors: ["http"], testing: { munit: true }, deployment: { target: "none" },
      operations: [{ name: "getCustomer", method: "GET", path: "/customers/{customerId}" }, { name: "createCustomer", method: "POST", path: "/customers" }]
    } : await interactiveConfig();
    const root = path.resolve(process.cwd(), config.project.name);
    if (fs.existsSync(root)) throw new Error(`Project already exists: ${config.project.name}`);
    fs.mkdirSync(root, { recursive: true });
    write(path.join(root, "muleforge.yaml"), YAML.stringify(config));
    ["src/main/mule", "src/main/resources/api", "src/main/resources/dw", "src/test/munit", "database", ".github/workflows"].forEach((d) => fs.mkdirSync(path.join(root, d), { recursive: true }));
    write(path.join(root, "README.md"), `# ${config.project.name}\n\nGenerated by MuleForge.\n\n## Commands\n\n- \`muleforge generate\`\n- \`muleforge validate\`\n- \`muleforge build\`\n- \`muleforge test\`\n`);
    generateProject(path.join(root, "muleforge.yaml"));
    console.log(`Next:\n  cd ${config.project.name}\n  muleforge validate\n  muleforge build\n`);
  });

program.command("generate [config]").description("Generate Mule project files from configuration").action((config = "muleforge.yaml") => generateProject(config));
program.command("validate [config]").description("Validate a MuleForge project").action((config = "muleforge.yaml") => validate(config));
program.command("build").description("Build the Mule application with Maven").action(() => runMaven(["clean", "package"]));
program.command("test").description("Run Mule tests with Maven").action(() => runMaven(["test"]));
program.command("clean").description("Clean the Maven target directory").action(() => runMaven(["clean"]));
program.command("doctor").description("Check local Node, Java, Maven and Git tooling").action(doctor);

program.parseAsync().catch((error) => { console.error(`\n❌ ${error.message}`); process.exitCode = 1; });
