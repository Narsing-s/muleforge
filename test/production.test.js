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
  assert.match(generateGithubActions(data), /muleforge verify/);
  assert.equal(fs.existsSync(root), true);
});
