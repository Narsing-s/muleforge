const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolveConnectors } = require("../src/connectors");
const { buildTraceability } = require("../src/traceability");
const { inspectProject } = require("../src/project-inspector");

test("enterprise connectors resolve", () => {
  const ids = resolveConnectors(["file","email","jms","kafka","salesforce"]).map(x => x.id);
  assert.deepEqual(ids, ["file","email","jms","kafka","salesforce"]);
});

test("traceability maps operations", () => {
  const report = buildTraceability({ operations: [{name:"getCustomer",method:"GET",path:"/customers"}], requirements: [] });
  assert.equal(report.operationCount, 1);
  assert.deepEqual(report.operations[0].targets, ["raml","mule","dataweave","munit","postman","documentation"]);
});

test("inspector returns a safe report for an arbitrary directory", () => {
  const report = inspectProject(".");
  assert.equal(typeof report.files, "number");
  assert.equal(typeof report.readyForMigrationReview, "boolean");
});


test("contract validator rejects malformed routes and unsupported methods", () => {
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const { validateContract } = require("../src/contract-validator");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-contract-")); const file = path.join(temp, "muleforge.yaml");
  fs.writeFileSync(file, "operations:\n  - name: bad\n    method: TRACE\n    path: customers\n    successStatus: 200\n", "utf8");
  const report = validateContract(file); assert.equal(report.valid, false); assert.ok(report.errors.some(x => x.includes("Unsupported HTTP method"))); assert.ok(report.errors.some(x => x.includes("must start")));
});

test("reference Mule XML contains only one database config", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const xml = fs.readFileSync(path.resolve(__dirname, "../customer-api/src/main/mule/customer-api.xml"), "utf8");
  assert.equal(xml.split("<db:config ").length - 1, 1);
});

test("MUnit generation adds policy-aware scenarios", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/munit-generator.js"), "utf8");
  assert.match(source, /retry-exhaustion/);
  assert.match(source, /transaction-rollback/);
  assert.match(source, /declaredStatuses/);
});

test("generated Maven MUnit configuration reserves a dynamic HTTP port", () => {
  const template = fs.readFileSync(path.resolve(__dirname, "../templates/pom.xml.hbs"), "utf8");
  assert.ok(template.includes("<dynamicPorts>"));
  assert.ok(template.includes("<dynamicPort>http.port</dynamicPort>"));
  assert.ok(template.includes("</dynamicPorts>"));
});

test("generated MUnit mocks external connector processors", () => {
  const { generateMunit } = require("../src/munit-generator");
  const xml = generateMunit({
    operations: [
      { name: "publishKafka", method: "POST", path: "/events", connector: "kafka", successStatus: 202 },
      { name: "sendEmail", method: "POST", path: "/mail", connector: "email", successStatus: 202 }
    ]
  }, { artifactId: "sample", hasDatabase: false });
  assert.match(xml, /processor="kafka:publish"/);
  assert.match(xml, /processor="email:send"/);
  assert.doesNotMatch(xml, /name="publishKafka-not-found-test"/);
});

test("generated MUnit keeps the customer not-found scenario only for the implemented Snowflake customer flow", () => {
  const { generateMunit } = require("../src/munit-generator");
  const xml = generateMunit({
    operations: [{ name: "getCustomer", method: "GET", path: "/customers/{customerId}", connector: "snowflake" }]
  }, { artifactId: "customer-api", hasDatabase: true, databaseType: "snowflake" });
  assert.match(xml, /name="getCustomer-not-found-test"/);
  assert.match(xml, /processor="db:select"/);
});


test("secret scanner ignores placeholders and flags literal credentials", () => {
  const { scanSecrets } = require("../src/security-scan");
  const os = require("node:os");
  const fs = require("node:fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-secret-test-"));
  try {
    fs.writeFileSync(path.join(dir, "safe.yaml"), "password: ${DB_PASSWORD}\nclientSecret: ${{ secrets.CLIENT_SECRET }}\n");
    fs.writeFileSync(path.join(dir, "unsafe.yaml"), "password: "hardcoded-password-123"\n");
    assert.deepEqual(scanSecrets(dir), ["unsafe.yaml"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CloudHub 2 deployment workflow uses Maven deployment and secret settings", () => {
  const { generateGithubActions } = require("../src/production");
  const { deploymentArtifacts } = require("../src/deployment-artifacts");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-deploy-"));
  deploymentArtifacts(root, { deployment: { target: "cloudhub2" } }, { artifactId: "sample", java: "17" });
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-cloudhub2.yml"), "utf8");
  assert.match(workflow, /MAVEN_SETTINGS_XML/);
  assert.match(workflow, /mvn -B/);
  assert.match(workflow, /-Dmuleforge\.cloudhub2=true/);
  assert.match(workflow, /-DmuleDeploy/);
  assert.match(workflow, /ANYPOINT_TARGET/);
});


test("deployment validator accepts supported targets and rejects CloudHub 2 snapshots", () => {
  const { validateDeployment } = require("../src/deployment-validator");
  assert.equal(validateDeployment({ project: { name: "x", version: "1.0.0" }, deployment: { target: "cloudhub" } }).valid, true);
  const bad = validateDeployment({ project: { name: "x", version: "1.0.0-SNAPSHOT" }, deployment: { target: "cloudhub2" } });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some(x => x.includes("SNAPSHOT")));
});

test("deployment target workflow generation covers CloudHub and Runtime Fabric", () => {
  const { deploymentArtifacts } = require("../src/deployment-artifacts");
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-deploy-targets-"));
  deploymentArtifacts(root, { deployment: { target: "cloudhub" } }, { artifactId: "sample", java: "17" });
  const ch = fs.readFileSync(path.join(root, ".github/workflows/deploy-cloudhub.yml"), "utf8");
  const rtf = fs.readFileSync(path.join(root, ".github/workflows/deploy-rtf.yml"), "utf8");
  assert.match(ch, /muleforge\.cloudhub=true/);
  assert.match(ch, /-DmuleDeploy/);
  assert.match(ch, /MAVEN_SETTINGS_XML/);
  assert.match(rtf, /deployment is not enabled/);
});


test("on-premises deployment workflow uses Runtime Manager armDeployment", () => {
  const { deploymentArtifacts } = require("../src/deployment-artifacts");
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-onprem-"));
  deploymentArtifacts(root, { deployment: { target: "onprem" } }, { artifactId: "sample", java: "17" });
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-onprem.yml"), "utf8");
  assert.match(workflow, /muleforge\.onprem=true/);
  assert.match(workflow, /ANYPOINT_TARGET_TYPE/);
  assert.match(workflow, /-DmuleDeploy/);
});


test("connector-generated flows include shared correlation and policy hooks", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/connector-flow-generator.js"), "utf8");
  assert.match(source, /correlationId/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /queryParams\.page/);
});


test("MUnit failure mocks use connector-specific error types", () => {
  const { generateMunit } = require("../src/munit-generator");
  const xml = generateMunit({ operations: [{ name: "publish", method: "POST", path: "/messages", connector: "kafka" }] }, { artifactId: "sample", hasDatabase: false });
  assert.match(xml, /kafka:publish/);
  assert.match(xml, /KAFKA:CONNECTIVITY/);
  assert.doesNotMatch(xml, /#\['CONNECTIVITY'\]/);
});

test("breaking checker separates request and response fields and detects type changes", () => {
  const { breakingChanges } = require("../src/breaking-check");
  const oldModel = {
    operations: [{
      name: "getCustomer", method: "GET", path: "/customers/{id}",
      requestFields: [{ name: "id", type: "string", required: true }],
      responseFields: [{ name: "status", type: "string", required: true }]
    }]
  };
  const newModel = {
    operations: [{
      name: "getCustomer", method: "GET", path: "/customers/{id}",
      requestFields: [{ name: "id", type: "string", required: true }],
      responseFields: [{ name: "status", type: "integer", required: true }]
    }]
  };
  const changes = breakingChanges(oldModel, newModel);
  assert.ok(changes.some(x => x.type === "response-field-type-changed"));
  assert.doesNotMatch(JSON.stringify(changes), /request field status was removed/);
});

test("generated pagination flow contains only one pagination response transform", () => {
  const { connectorFlow } = require("../src/connector-flow-generator");
  const xml = connectorFlow({
    name: "listCustomers", method: "GET", path: "/customers",
    connector: "database", table: "CUSTOMER",
    pagination: { defaultPageSize: 20, maxPageSize: 100 }
  }, { artifactId: "sample", basePath: "/api/v1", hasDatabase: true, databaseTable: "CUSTOMER" });
  assert.equal((xml.match(/doc:name="Build pagination response"/g) || []).length, 1);
});

test("connector failure MUnit expects the generated 503 dependency response", () => {
  const { generateMunit } = require("../src/munit-generator");
  const xml = generateMunit({ operations: [{ name: "publish", method: "POST", path: "/messages", connector: "kafka" }] }, { artifactId: "sample", hasDatabase: false });
  assert.match(xml, /KAFKA:CONNECTIVITY/);
  assert.match(xml, /equalTo\(503\)/);
});


test("contract validator rejects invalid field schemas and error statuses", () => {
  const { validateContract } = require("../src/contract-validator");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-contract-"));
  const file = path.join(dir, "muleforge.yaml");
  fs.mkdirSync(path.join(dir, "src/main/resources/api"), { recursive: true });
  fs.writeFileSync(file, [
    "operations:",
    "  - name: bad",
    "    method: GET",
    "    path: /bad",
    "    requestFields:",
    "      - name: id",
    "        type: uuid",
    "        required: yes",
    "    errors:",
    "      - status: 418"
  ].join("\n"));
  const report = validateContract(file);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(x => x.includes("unsupported requestFields type")));
  assert.ok(report.errors.some(x => x.includes("required must be boolean")));
  assert.ok(report.errors.some(x => x.includes("unsupported declared error status")));
});


test("release readiness checks include version synchronization gates", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /CLI version sync/);
  assert.match(source, /changelog version/);
  assert.match(source, /workflow syntax/);
});


test("deployment config generates API Manager rate-limit policy manifest", () => {
  const { deploymentArtifacts } = require("../src/deployment-artifacts");
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-rate-limit-"));
  deploymentArtifacts(root, {
    deployment: { target: "cloudhub2" },
    operations: [{
      name: "list-customers", method: "GET", path: "/customers",
      rateLimit: { requests: 100, periodSeconds: 60 }
    }]
  }, { artifactId: "sample", java: "17" });
  const file = path.join(root, "docs/09-deployment/api-manager-policies.json");
  assert.equal(fs.existsSync(file), true);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(manifest.policies.length, 1);
  assert.equal(manifest.policies[0].policyType, "rate-limiting");
  assert.equal(manifest.policies[0].policyVersion, "1.2.0");
  assert.equal(manifest.policies[0].configuration.rateLimits[0].maximumRequests, 100);
  assert.equal(manifest.policies[0].configuration.rateLimits[0].timePeriodInMilliseconds, 60000);
  assert.equal(manifest.policies[0].pointcut[0].methodRegex, "GET");
  assert.equal(manifest.policies[0].pointcut[0].uriTemplateRegex, "/customers");
});

test("connector flow generates retry policy and HTTP timeout", () => {
  const { connectorFlow } = require("../src/connector-flow-generator");
  const retry = connectorFlow({
    name: "get-customer", method: "GET", path: "/customers/{id}", connector: "database",
    retry: { maxRetries: 4, millisBetweenRetries: 250 }
  }, { artifactId: "demo", basePath: "/api", databaseTable: "CUSTOMER", hasDatabase: true });
  assert.match(retry, /<until-successful maxRetries="4" millisBetweenRetries="250">/);
  assert.match(retry, /<\/until-successful>/);
  const http = connectorFlow({
    name: "downstream", method: "GET", path: "/downstream", connector: "http",
    downstreamEndpoint: "https://example.test", timeout: 5000
  }, { artifactId: "demo", basePath: "/api" });
  assert.match(http, /responseTimeout="5000"/);
});
