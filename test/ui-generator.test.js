const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeRequirementDocument } = require("../src/document-analyzer");
const { generateUiAssets } = require("../src/ui-generator");

test("UI generation returns complete assets without creating a project", () => {
  const model = analyzeRequirementDocument(`Create a customer REST API with POST /customers. Accept name and email. Validate name and email. Duplicate customer returns 409. Unexpected errors return 500.`, "customer.txt");
  const result = generateUiAssets(model);
  assert.equal(result.summary.credentialFree, true);
  assert.ok(Object.keys(result.files).some(name => name.endsWith(".raml")));
  assert.ok(Object.keys(result.files).some(name => name.endsWith(".xml")));
  assert.ok(Object.keys(result.files).some(name => name.endsWith("-test.xml")));
  assert.ok(Object.keys(result.files).some(name => name.endsWith(".collection.json")));
  assert.ok(result.files["main-flow.md"].includes("HTTP Listener"));
});
