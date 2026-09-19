const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { generatePostman, generateEnvironment, generateGithubActions } = require("../src/production");

test("production generators create Postman, environment and CI assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-prod-"));
  const config = { operations: [
    { name: "Create customer", method: "POST", path: "/customers", successStatus: 201 },
    { name: "Get customer", method: "GET", path: "/customers/{customerId}", successStatus: 200 }
  ] };
  const data = { apiName: "Customer API", artifactId: "customer-api", basePath: "/api/v1", java: "17" };
  const postman = JSON.parse(generatePostman(config, data));
  assert.equal(postman.item.length, 2);
  assert.equal(postman.item[0].request.method, "POST");
  assert.match(generateEnvironment("dev"), /MuleForge/);
  assert.match(generateGithubActions(data), /Static project gate/); assert.match(generateGithubActions(data), /mvn -B -DskipTests=false clean package/);
  assert.equal(fs.existsSync(root), true);
});

test("Postman generation includes path variables, security and schema response assertions", () => {
  const config = { operations: [{
    name: "Get customer", method: "GET", path: "/customers/{customerId}", security: "oauth2",
    responseFields: [{ name: "id" }, { name: "status", type: "string" }]
  }] };
  const collection = JSON.parse(generatePostman(config, { apiName: "Customer API", basePath: "/api/v1" }));
  const item = collection.item[0];
  assert.deepEqual(item.request.url.variable, [{ key: "customerId", value: "{{customerId}}" }]);
  assert.equal(item.request.auth.type, "bearer");
  assert.ok(item.event[0].script.exec.some(line => line.includes("Response body contains documented fields")));
  assert.ok(item.event[0].script.exec.some(line => line.includes("Missing response field: ")));
});

test("Postman request bodies preserve structured requirement fields", () => {
  const config = { operations: [{
    name: "Create", method: "POST", path: "/customers",
    requestFields: [{ name: "email", type: "string", required: true }, { name: "age", type: "integer" }]
  }] };
  const collection = JSON.parse(generatePostman(config, { apiName: "Customer API", basePath: "/api/v1" }));
  const body = JSON.parse(collection.item[0].request.body.raw);
  assert.deepEqual(Object.keys(body), ["email", "age"]);
});
