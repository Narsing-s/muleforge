const test = require("node:test");
const assert = require("node:assert/strict");
const { validateApiGovernance } = require("../src/api-governance");

test("api governance accepts a well-formed operation", () => {
  const r = validateApiGovernance({
    api: { name: "Customer API", version: "v1", basePath: "/api/v1" },
    operations: [{ name: "get_customer", method: "GET", path: "/customers/{id}", successStatus: 200, responseFields: [{ name: "id", type: "string" }], errors: [{ status: 404 }] }]
  });
  assert.equal(r.valid, true);
});

test("api governance detects duplicate operations and invalid paths", () => {
  const r = validateApiGovernance({
    api: { name: "Customer API", version: "v1", basePath: "/api/v1" },
    operations: [{ method: "GET", path: "customers" }, { method: "GET", path: "customers" }]
  });
  assert.equal(r.valid, false);
  assert.ok(r.findings.some(x => x.code === "PATH_INVALID"));
  assert.ok(r.findings.some(x => x.code === "DUPLICATE_OPERATION"));
});