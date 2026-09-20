const fs = require("fs");
const path = require("path");

function safe(value) { return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "-"); }
function fieldObject(field) { return typeof field === "string" ? { name: field, type: "string" } : (field || {}); }
function fieldName(field) { const f = fieldObject(field); return f.name || f.field; }
function pathParameters(pathname) { return [...String(pathname || "").matchAll(/\{([^}]+)\}/g)].map(m => m[1]); }
function responseAssertions(op) {
  const lines = [
    `pm.test("Expected ${op.successStatus}", function () { pm.response.to.have.status(${op.successStatus}); });`
  ];
  const fields = Array.isArray(op.responseFields) ? op.responseFields.map(fieldName).filter(Boolean) : [];
  if (fields.length) {
    lines.push('pm.test("Response body contains documented fields", function () { const body = pm.response.json(); const fields = ' + JSON.stringify(fields) + '; fields.forEach(function (field) { pm.expect(Object.prototype.hasOwnProperty.call(body, field), "Missing response field: " + field).to.eql(true); }); });');
  }
  return lines;
}
function operations(config = {}) {
  return (config.operations || []).map(op => ({
    name: op.name || `${String(op.method || "GET").toUpperCase()} ${op.path}`,
    method: String(op.method || "GET").toUpperCase(), path: op.path || "/", requestFields: op.requestFields || [], responseFields: op.responseFields || [], errors: op.errors || [], security: op.security || null, successStatus: op.successStatus || (String(op.method || "GET").toUpperCase() === "POST" ? 201 : 200)
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
        url: { raw: `{{baseUrl}}${data.basePath}${op.path}`, host: ["{{baseUrl}}"], path: `${data.basePath}${op.path}`.split("/").filter(Boolean), variable: pathParameters(op.path).map(name => ({ key: name, value: "{{" + name + "}}" })) }
      };
      if (op.security === "client-id" || op.security === "clientId") request.header.push({ key: "client_id", value: "{{clientId}}" });
      if (op.security === "oauth2") request.auth = { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] };
      if (op.security === "basic") request.auth = { type: "basic", basic: [{ key: "username", value: "{{username}}", type: "string" }, { key: "password", value: "{{password}}", type: "string" }] };
      if (["POST", "PUT", "PATCH"].includes(op.method) && op.requestFields.length) {
        request.body = { mode: "raw", raw: JSON.stringify(Object.fromEntries(op.requestFields.map(field => [fieldName(field), exampleValue(fieldName(field))]).filter(([name]) => name)), null, 2), options: { raw: { language: "json" } } };
      }
      return { name: op.name, request, event: [{ listen: "test", script: { type: "text/javascript", exec: responseAssertions(op) } }] };
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
  return `name: Mule application CI

on:
  pull_request:
  push:
    branches: [ main ]

permissions:
  contents: read

jobs:
  verify-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '${data.java}'
          cache: maven
      - name: Static project gate
        shell: bash
        run: |
          test -f pom.xml
          test -f mule-artifact.json
          test -f src/main/resources/application.yaml
          test -d src/main/mule
          ${data.workloadType === "api" ? "test -d src/main/resources/api" : "true # API contract not required for this workload"}
          test -d src/test/munit
      - name: Validate Maven settings
        env:
          MAVEN_SETTINGS_XML: \${{ secrets.MAVEN_SETTINGS_XML }}
        run: |
          if [ -z "$MAVEN_SETTINGS_XML" ]; then
            echo "::error::MAVEN_SETTINGS_XML is required to build generated Mule applications."
            exit 1
          fi
          mkdir -p "$HOME/.m2"
          printf '%s' "$MAVEN_SETTINGS_XML" > "$HOME/.m2/settings.xml"
          test -s "$HOME/.m2/settings.xml"
      - name: Build and test with Maven
        run: |
          mvn -B -DskipTests=false clean package -ntp -s "$HOME/.m2/settings.xml" \
            -Dmunit.coverage.failBuild=false
      - name: Upload Maven/MUnit reports
        if: \${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: muleforge-maven-reports
          if-no-files-found: warn
          path: |
            "**/target/surefire-reports/**"
            "**/target/site/munit/coverage/**"
            "**/target/*.jar"
`;
}
function writeProductionArtifacts(root, config, data) {
  const postmanDir = path.join(root, "postman"), envDir = path.join(root, "src/main/resources/properties"), workflowDir = path.join(root, ".github/workflows");
  for (const dir of [postmanDir, envDir, workflowDir]) fs.mkdirSync(dir, { recursive: true });
  if (data.workloadType === "api") fs.writeFileSync(path.join(postmanDir, `${safe(data.artifactId)}.collection.json`), generatePostman(config, data), "utf8");
  for (const env of ["dev", "qa", "uat", "prod"]) fs.writeFileSync(path.join(envDir, `application-${env}.yaml`), generateEnvironment(env, data), "utf8");
  fs.writeFileSync(path.join(workflowDir, "ci-generated.yml"), generateGithubActions(data), "utf8");
  fs.writeFileSync(path.join(root, ".dockerignore"), "target\nnode_modules\n.mule\n.settings\n.project\n.classpath\n*.log\n", "utf8");
}
module.exports = { generatePostman, generateEnvironment, generateGithubActions, writeProductionArtifacts };
