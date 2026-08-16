#!/usr/bin/env node

const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const YAML = require("yaml");
const Handlebars = require("handlebars");

const VERSION = "0.2.0";
const program = new Command();

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function loadConfig(configPath = "muleforge.yaml") {
  const full = path.resolve(configPath);
  if (!fs.existsSync(full)) throw new Error(`Configuration not found: ${configPath}`);
  const config = YAML.parse(fs.readFileSync(full, "utf8")) || {};
  if (!config.project?.name) throw new Error("muleforge.yaml must contain project.name");
  return config;
}

function context(config) {
  const project = config.project || {};
  const api = config.api || {};
  return {
    projectName: project.name,
    artifactId: project.artifactId || project.name,
    groupId: project.groupId || "com.example",
    version: project.version || "1.0.0",
    muleRuntime: project.muleRuntime || "4.9.0",
    apiName: api.name || project.name,
    apiVersion: api.version || "v1",
    basePath: api.basePath || "/api/v1"
  };
}

function render(template, data) {
  return Handlebars.compile(template, { noEscape: true })(data);
}

function normalizeOperation(operation) {
  const method = String(operation.method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  return { name: operation.name || `${method.toLowerCase()}Operation`, method, path: operation.path || "/" };
}

function generateRaml(config, data) {
  const operations = (config.operations || []).map(normalizeOperation);
  const grouped = new Map();
  for (const op of operations) {
    const pathKey = op.path.replace(/\/{[^}]+}/g, "").replace(/\/$/, "") || "/";
    if (!grouped.has(pathKey)) grouped.set(pathKey, []);
    grouped.get(pathKey).push(op);
  }

  let raml = `#%RAML 1.0\ntitle: ${data.apiName}\nversion: ${data.apiVersion}\nbaseUri: ${data.basePath}\n\n`;
  for (const [resourcePath, ops] of grouped) {
    raml += `${resourcePath}:\n`;
    for (const op of ops) {
      raml += `  ${op.method.toLowerCase()}:\n`;
      raml += `    description: ${op.name}\n`;
      if (["POST", "PUT", "PATCH"].includes(op.method)) {
        raml += `    body:\n      application/json:\n        type: object\n`;
      }
      raml += `    responses:\n      ${op.method === "POST" ? "201" : "200"}:\n        body:\n          application/json:\n            type: object\n`;
    }
  }
  return raml;
}

function generateMuleXml(config, data) {
  const operations = (config.operations || []).map(normalizeOperation);
  const listenerPath = `${data.basePath.replace(/\/$/, "")}/#[attributes.uriParams.* default {}]`;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core"\n      xmlns:http="http://www.mulesoft.org/schema/mule/http"\n      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"\n      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"\n      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n      xsi:schemaLocation="\n        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd\n        http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd\n        http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">\n\n`;
  xml += `  <http:listener-config name="HTTP_Listener_config" doc:name="HTTP Listener config">\n    <http:listener-connection host="0.0.0.0" port="\${http.port}" />\n  </http:listener-config>\n\n`;

  for (const op of operations) {
    const safeName = `${data.artifactId}-${op.name}`.replace(/[^A-Za-z0-9_-]/g, "-");
    const pathValue = `${data.basePath.replace(/\/$/, "")}${op.path.startsWith("/") ? op.path : `/${op.path}`}`;
    xml += `  <flow name="${safeName}-flow">\n`;
    xml += `    <http:listener config-ref="HTTP_Listener_config" path="${pathValue}" allowedMethods="${op.method}" doc:name="${op.method} ${op.path}" />\n`;
    xml += `    <logger level="INFO" message="MuleForge operation: ${op.name}" doc:name="Logger" />\n`;
    xml += `    <ee:transform doc:name="Response">\n`;
    xml += `      <ee:message>\n`;
    xml += `        <ee:set-payload><![CDATA[\n%dw 2.0\noutput application/json\n---\n{\n  message: "MuleForge generated operation",\n  operation: "${op.name}",\n  method: "${op.method}"\n}\n        ]]></ee:set-payload>\n`;
    xml += `      </ee:message>\n`;
    xml += `    </ee:transform>\n`;
    xml += `  </flow>\n\n`;
  }

  if (operations.length === 0) {
    xml += `  <flow name="${data.artifactId}-health-flow">\n`;
    xml += `    <http:listener config-ref="HTTP_Listener_config" path="${data.basePath}/health" allowedMethods="GET" doc:name="Health" />\n`;
    xml += `    <ee:transform doc:name="Health Response"><ee:message><ee:set-payload><![CDATA[\n%dw 2.0\noutput application/json\n---\n{ status: "UP", application: "${data.projectName}" }\n    ]]></ee:set-payload></ee:message></ee:transform>\n`;
    xml += `  </flow>\n`;
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
  write(path.join(root, "src/main/resources/api", `${data.artifactId}.raml`), generateRaml(config, data));
  write(path.join(root, "src/main/mule", `${data.artifactId}.xml`), generateMuleXml(config, data));
  write(path.join(root, "src/main/resources/application.yaml"), `http:\n  port: 8081\n\napi:\n  name: ${data.apiName}\n  version: ${data.apiVersion}\n`);

  if ((config.testing || {}).munit !== false) {
    write(path.join(root, "src/test/munit", `${data.artifactId}-test.xml`), render(munit, data));
  }

  console.log("\n🚀 MuleForge Generator\n");
  console.log("✔ Generated pom.xml");
  console.log("✔ Generated mule-artifact.json");
  console.log(`✔ Generated ${data.artifactId}.raml`);
  console.log(`✔ Generated ${data.artifactId}.xml`);
  if ((config.testing || {}).munit !== false) console.log("✔ Generated MUnit test");
  console.log("\n🎉 Project generated successfully.\n");
}

function validate(configPath = "muleforge.yaml") {
  const config = loadConfig(configPath);
  const data = context(config);
  const root = path.resolve(path.dirname(configPath));
  const required = [
    "pom.xml",
    "mule-artifact.json",
    "src/main/resources/application.yaml",
    `src/main/resources/api/${data.artifactId}.raml`,
    `src/main/mule/${data.artifactId}.xml`
  ];
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));

  console.log("\n🚀 MuleForge Validator\n");
  console.log(`✔ Configuration: ${configPath}`);
  console.log(`✔ Project: ${data.projectName}`);
  console.log(`✔ Mule runtime: ${data.muleRuntime}`);
  console.log(`✔ API: ${data.apiName} ${data.apiVersion}`);
  if (missing.length) {
    missing.forEach((file) => console.log(`✖ Missing: ${file}`));
    console.error(`\n${missing.length} problem(s) found.`);
    process.exitCode = 1;
    return;
  }
  console.log("✔ Maven project");
  console.log("✔ Mule artifact");
  console.log("✔ RAML specification");
  console.log("✔ Mule implementation");
  console.log("✔ Application properties");
  console.log("\nValidation successful.\n");
}

function runMaven(args) {
  try {
    execFileSync(process.platform === "win32" ? "mvn.cmd" : "mvn", args, { stdio: "inherit" });
  } catch (error) {
    process.exitCode = error.status || 1;
  }
}

function doctor() {
  console.log("\n🚀 MuleForge Doctor\n");
  for (const command of ["node", "java", "mvn", "git"]) {
    try {
      execFileSync(process.platform === "win32" ? `${command}.cmd` : command, ["--version"], { stdio: "inherit" });
      console.log(`✔ ${command}`);
    } catch {
      console.log(`✖ ${command} not found`);
    }
  }
}

program.name("muleforge").description("Open-source Mule 4 API project generator").version(VERSION);

program.command("init <projectName>")
  .description("Create a MuleForge project")
  .option("--runtime <version>", "Mule runtime version", "4.9.0")
  .option("--group <groupId>", "Maven groupId", "com.example")
  .action((projectName, options) => {
    if (!/^[A-Za-z0-9._-]+$/.test(projectName)) throw new Error("Project name may contain only letters, numbers, dots, underscores and hyphens");
    const root = path.resolve(process.cwd(), projectName);
    if (fs.existsSync(root)) throw new Error(`Project already exists: ${projectName}`);

    const config = `project:\n  name: ${projectName}\n  artifactId: ${projectName}\n  groupId: ${options.group}\n  version: 1.0.0\n  muleRuntime: ${options.runtime}\n\napi:\n  name: ${projectName}\n  version: v1\n  specification: RAML\n  basePath: /api/v1\n\noperations:\n  - name: getCustomer\n    method: GET\n    path: /customers/{customerId}\n\n  - name: createCustomer\n    method: POST\n    path: /customers\n\ndatabase:\n  type: none\n\ntesting:\n  munit: true\n\ndeployment:\n  target: none\n`;

    write(path.join(root, "muleforge.yaml"), config);
    ["src/main/mule", "src/main/resources/api", "src/main/resources/dw", "src/test/munit", "database", ".github/workflows"].forEach((d) => fs.mkdirSync(path.join(root, d), { recursive: true }));
    write(path.join(root, "README.md"), `# ${projectName}\n\nGenerated by MuleForge.\n\n## Commands\n\n\`muleforge generate\`\n\n\`muleforge validate\`\n\n\`muleforge build\`\n\n\`muleforge test\`\n`);

    generateProject(path.join(root, "muleforge.yaml"));
    console.log(`Next:\n  cd ${projectName}\n  muleforge validate\n  muleforge build\n`);
  });

program.command("generate [config]").description("Generate Mule project files from configuration").action((config = "muleforge.yaml") => generateProject(config));
program.command("validate [config]").description("Validate a MuleForge project").action((config = "muleforge.yaml") => validate(config));
program.command("build").description("Build the Mule application with Maven").action(() => runMaven(["clean", "package"]));
program.command("test").description("Run Mule tests with Maven").action(() => runMaven(["test"]));
program.command("clean").description("Clean the Maven target directory").action(() => runMaven(["clean"]));
program.command("doctor").description("Check local Node, Java, Maven and Git tooling").action(doctor);

try { program.parse(); } catch (error) { console.error(`\n❌ ${error.message}`); process.exitCode = 1; }
