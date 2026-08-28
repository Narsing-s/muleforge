const test = require("node:test");
const assert = require("node:assert/strict");
const { generateBusinessFlows } = require("../src/business-generator");

test("generated flows include standard HTTP error handling", () => {
  const xml = generateBusinessFlows({ operations: [
    { name: "Create customer", method: "POST", path: "/customers", validation: ["valid email"] }
  ] }, { artifactId: "customer-api", basePath: "/api/v1", hasDatabase: false });
  assert.match(xml, /VALIDATION:VALIDATION/);
  assert.match(xml, /HTTP:NOT_FOUND/);
  assert.match(xml, /CONNECTIVITY/);
  assert.match(xml, /TIMEOUT/);
  assert.match(xml, /RETRY_EXHAUSTED/);
  assert.match(xml, /INTERNAL_ERROR/);
});
