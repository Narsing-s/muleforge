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
