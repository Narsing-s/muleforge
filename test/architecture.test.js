const test = require("node:test");
const assert = require("node:assert/strict");
const { inferApiLedArchitecture } = require("../src/architecture");

test("derives all API-led layers from explicit documentation", () => {
  const architecture = inferApiLedArchitecture({
    text: [
      "Mobile Experience API calls the Customer Process API.",
      "The Process API orchestrates CRM and Customer System API.",
      "Customer System API accesses Salesforce."
    ].join("\n")
  });
  assert.deepEqual(architecture.layers.map(x => x.name), ["Experience API", "Process API", "System API"]);
  assert.equal(architecture.confidence, "high");
  assert.equal(architecture.relationships.length, 2);
});

test("does not invent Experience or Process APIs", () => {
  const architecture = inferApiLedArchitecture({
    text: "POST /customers stores customer data in Snowflake through the Customer System API."
  });
  assert.deepEqual(architecture.layers.map(x => x.name), ["System API"]);
  assert.equal(architecture.layers.some(x => x.name === "Experience API"), false);
  assert.equal(architecture.layers.some(x => x.name === "Process API"), false);
  assert.ok(architecture.assumptions.some(x => /Experience API/.test(x)));
});

test("uses operation evidence when repository metadata is supplied", () => {
  const architecture = inferApiLedArchitecture({
    operations: [{ method: "POST", path: "/orders", connector: "database" }]
  });
  assert.equal(architecture.layers[0].name, "System API");
});
