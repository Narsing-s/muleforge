const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function runCli(cwd, ...args) { return execFileSync(process.execPath, [path.resolve(__dirname, "../src/index.js"), ...args], { cwd, encoding: "utf8" }); }

test("muleforge init generates a complete project skeleton", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-"));
  runCli(temp, "init", "customer-api");
  const root = path.join(temp, "customer-api");
  for (const file of ["muleforge.yaml", "pom.xml", "mule-artifact.json", "src/main/resources/application.yaml", "src/main/resources/api/customer-api.raml", "src/main/mule/customer-api.xml", "src/test/munit/customer-api-test.xml", "postman/customer-api.collection.json"]) assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
});

test("document analysis generates end-to-end assets without backend credentials", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-doc-"));
  const requirement = path.join(temp, "customer-requirement.md");
  fs.writeFileSync(requirement, "# Customer API\nPOST /customers accepts name and email. Validate required fields and email. Duplicate customer returns 409. Unexpected errors return 500.", "utf8");
  runCli(temp, "analyze", requirement, "customer-api");
  const root = path.join(temp, "customer-api");
  const mule = fs.readFileSync(path.join(root, "src/main/mule/customer-api.xml"), "utf8");
  const postman = fs.readFileSync(path.join(root, "postman/customer-api.collection.json"), "utf8");
  const scenarios = fs.readFileSync(path.join(root, "docs/08-testing/test-scenarios.md"), "utf8");
  assert.match(mule, /http:listener/); assert.match(mule, /POST/); assert.match(postman, /customers/); assert.match(scenarios, /happy path/); assert.equal(fs.existsSync(path.join(root, "docs/06-flows/main-flow.md")), true);
});

test("snowflake-database connector alias is accepted", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-snowflake-"));
  const config = path.join(temp, "muleforge.yaml");
  fs.writeFileSync(config, "project:\n  name: customer-api\n  artifactId: customer-api\napi:\n  name: customer-api\n  version: v1\n  basePath: /api/v1\nconnectors:\n  - http\n  - snowflake-database\noperations:\n  - name: create_customer\n    method: POST\n    path: /customers\n    requestFields: [name, email]\n    responseFields: [id, name, email]\n    validation: [name is required, email is required]\n    successStatus: 201\n    errors: [Duplicate returns 409]\n", "utf8");
  runCli(temp, "generate", config);
  assert.equal(fs.existsSync(path.join(temp, "src/main/mule/customer-api.xml")), true);
});
