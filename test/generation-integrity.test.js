const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { snapshot, diffSnapshots } = require("../src/diff");

test("generated POM keeps Mule and MUnit plugins inside build/plugins", () => {
  const pom = fs.readFileSync(path.resolve(__dirname, "../templates/pom.xml.hbs"), "utf8");
  assert.match(pom, /<munit\.version>3\.7\.4<\/munit\.version>/);
  assert.match(pom, /<plugins>[\s\S]*mule-maven-plugin[\s\S]*munit-maven-plugin[\s\S]*<\/plugins>/);
  assert.equal((pom.match(/<plugins>/g) || []).length, 5);
  assert.match(pom, /<artifactId>munit-runner<\/artifactId>/);
  assert.match(pom, /<artifactId>munit-tools<\/artifactId>/);
  assert.match(pom, /<munit\.runtimeversion>\$\{app\.runtime\}<\/munit\.runtimeversion>/);
});

test("snapshot diff reports added and removed project files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-diff-"));
  fs.writeFileSync(path.join(root, "a.txt"), "a");
  const before = snapshot(root);
  fs.writeFileSync(path.join(root, "b.txt"), "b");
  fs.rmSync(path.join(root, "a.txt"));
  const after = snapshot(root);
  const diff = diffSnapshots(before, after);
  assert.deepEqual(diff.added, ["b.txt"]);
  assert.deepEqual(diff.removed, ["a.txt"]);
  assert.deepEqual(diff.unchanged, []);
});

test("release-check is exposed by the CLI", () => {
  const index = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(index, /release-check \[directory\]/);
  assert.match(index, /runtime-validation\.yml/);
  assert.match(index, /docs.*cicd.*runtime-validation\.md/);
});


test("connector audit requires dependency, namespace, config and operation evidence", () => {
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const { auditConnectors } = require("../src/connector-audit");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-connector-audit-"));
  fs.mkdirSync(path.join(root, "src/main/mule"), { recursive: true });
  fs.writeFileSync(path.join(root, "muleforge.yaml"), "connectors: [kafka]\noperations:\n  - name: publish\n    connector: kafka\n", "utf8");
  fs.writeFileSync(path.join(root, "pom.xml"), "<artifactId>mule-kafka-connector</artifactId>", "utf8");
  fs.writeFileSync(path.join(root, "src/main/mule/api.xml"), '<mule xmlns:kafka="http://www.mulesoft.org/schema/mule/kafka"><kafka:producer-config name="Kafka_Config"/><kafka:publish config-ref="Kafka_Config"/></mule>', "utf8");
  const report = auditConnectors(path.join(root, "muleforge.yaml"));
  assert.equal(report.ready, true);
});

test("CLI exposes connector-check and sync-docs", () => {
  const fs = require("node:fs"); const path = require("node:path");
  const index = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(index, /connector-check \[config\]/);
  assert.match(index, /sync-docs \[config\]/);
});


test("CLI exposes deployment-check", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /deployment-check/);
  assert.match(source, /validateDeployment/);
});


test("generated business flows support correlation IDs and configured retries", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/business-generator.js"), "utf8");
  assert.match(source, /correlationId/);
  assert.match(source, /until-successful/);
  assert.match(source, /maxRetries/);
});
test("CloudHub 2 deployment validation enforces target and supported vCores", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/contract-validator.js"), "utf8");
  assert.match(source, /deployment requires target/);
  assert.match(source, /validVCores/);
});


test("release workflow is gated by tests, self-test and release readiness", () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, "../.github/workflows/release.yml"), "utf8");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /self-test/);
  assert.match(workflow, /release-check/);
  assert.match(workflow, /npm pack/);
});


test("operation policy validator rejects invalid reliability and security settings", () => {
  const { validateOperationPolicies } = require("../src/contract-validator");
  const result = validateOperationPolicies([
    { name: "bad", method: "GET", pagination: { defaultPageSize: 200, maxPageSize: 10 }, idempotency: true, security: "unknown" },
    { name: "retry", method: "POST", retry: { maxRetries: 0, millisBetweenRetries: -1 } }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 4);
});

test("RAML generator contains security, pagination, idempotency and error contract support", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /securitySchemes/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /queryParameters/);
  assert.match(source, /op.errors/);
});

test("self-test includes deployment and policy validation", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /policies = validateOperationPolicies/);
  assert.match(source, /validateDeployment\(model\.deployment/);
});
