const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSaveRequest } = require("../src/ui-server");

function model(overrides = {}) {
  return {
    requirement: "Create GET /customers/{id}.",
    project: { name: "customer-api" },
    operations: [{ name: "get_customer", method: "GET", path: "/customers/{id}", connector: "http" }],
    conflicts: [],
    missingConfigurations: [],
    approval: { approved: true },
    ...overrides
  };
}

test("save validation requires explicit user approval", () => {
  assert.throws(() => validateSaveRequest(model({ approval: { approved: false } }), false), /approval is required/i);
});

test("save validation rejects unresolved conflicts and configuration", () => {
  assert.throws(() => validateSaveRequest(model({ conflicts: [{ type: "document" }] }), true), /conflicts/i);
  assert.throws(() => validateSaveRequest(model({ missingConfigurations: [{ connector: "database" }] }), true), /connectivity/i);
});

test("save validation accepts a confirmed approved model", () => {
  assert.equal(validateSaveRequest(model(), true), true);
});
