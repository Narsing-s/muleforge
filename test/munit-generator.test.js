const test = require("node:test");
const assert = require("node:assert/strict");
const { generateMunit } = require("../src/munit-generator");

test("generates happy-path and not-found MUnit scenarios", () => {
  const config = { operations: [
    { name: "Create customer", method: "POST", path: "/customers", successStatus: 201 },
    { name: "Get customer", method: "GET", path: "/customers/{customerId}", successStatus: 200 }
  ] };
  const xml = generateMunit(config, { artifactId: "customer-api", hasDatabase: true });
  assert.match(xml, /Create-customer-happy-path-test/);
  assert.match(xml, /Get-customer-not-found-test/);
  assert.match(xml, /db:select/);
  assert.match(xml, /equalTo\(404\)/);
});
