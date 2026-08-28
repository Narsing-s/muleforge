const fs = require("fs");
const path = require("path");

function safe(value) { return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "-"); }
function operations(config = {}) {
  return (config.operations || []).map(op => ({
    name: op.name || `${String(op.method || "GET").toUpperCase()} ${op.path}`,
    method: String(op.method || "GET").toUpperCase(), path: op.path || "/", requestFields: op.requestFields || [], successStatus: op.successStatus || (String(op.method || "GET").toUpperCase() === "POST" ? 201 : 200)
  }));
}
function exampleValue(field) {
  const name = String(field).toLowerCase();
  if (name.includes("email")) return "customer@example.com";
  if (name.includes("phone") || name.includes("mobile")) return "9999999999";
  if (name.includes("amount")) return 100;
  if (name === "id" || name.endsWith("id")) return 1;
  if (name.includes("date")) return "2026-01-01";
  return "string";
}
function generatePostman(config, data) {
  const collection = {
    info: { name: data.apiName, description: "Generated locally from the MuleForge requirement model", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    variable: [{ key: "baseUrl", value: "http://localhost:8081" }],
    item: operations(config).map(op => {
      const request = {
        method: op.method,
        header: [{ key: "Content-Type", value: "application/json" }],
        url: { raw: `{{baseUrl}}${data.basePath}${op.path}`, host: ["{{baseUrl}}"], path: `${data.basePath}${op.path}`.split("/").filter(Boolean) }
      };
      if (["POST", "PUT", "PATCH"].includes(op.method) && op.requestFields.length) {
        request.body = { mode: "raw", raw: JSON.stringify(Object.fromEntries(op.requestFields.map(field => [field, exampleValue(field)])), null, 2), options: { raw: { language: "json" } } };
      }
      return { name: op.name, request, event: [{ listen: "test", script: { exec: [`pm.test(\"Expected ${op.successStatus}\", function () { pm.response.to.have.status(${op.successStatus}); });`] } }] };
    })
  };
  return JSON.stringify(collection, null, 2) + "\n";
}
function generateEnvironment(environment, data = {}) {
  let out = `# MuleForge ${environment} environment\nhttp:\n  port: 8081\n`;
  if (data.hasDatabase) out += `db:\n  url: \${db.url}\n  user: \${db.user}\n  password: \${db.password}\n`;
  return out;
}
function generateGithubActions(data) {
  return `name: MuleForge CI\n\non:\n  pull_request:\n  push:\n    branches: [ main ]\n\njobs:\n  verify-build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '${data.java}'\n      - name: Install dependencies\n        run: npm ci\n      - name: Verify project\n        run: npx muleforge verify\n      - name: Build with Maven\n        run: mvn -B -DskipTests=false clean package\n`;
}
function writeProductionArtifacts(root, config, data) {
  const postmanDir = path.join(root, "postman"), envDir = path.join(root, "src/main/resources/properties"), workflowDir = path.join(root, ".github/workflows");
  for (const dir of [postmanDir, envDir, workflowDir]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(postmanDir, `${safe(data.artifactId)}.collection.json`), generatePostman(config, data), "utf8");
  for (const env of ["dev", "qa", "uat", "prod"]) fs.writeFileSync(path.join(envDir, `application-${env}.yaml`), generateEnvironment(env, data), "utf8");
  fs.writeFileSync(path.join(workflowDir, "ci-generated.yml"), generateGithubActions(data), "utf8");
  fs.writeFileSync(path.join(root, ".dockerignore"), "target\nnode_modules\n.mule\n.settings\n.project\n.classpath\n*.log\n", "utf8");
}
module.exports = { generatePostman, generateEnvironment, generateGithubActions, writeProductionArtifacts };
