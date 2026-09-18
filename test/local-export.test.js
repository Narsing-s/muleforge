const test = require("node:test");
const assert = require("node:assert/strict");
const { safeName, desktopPath } = require("../src/local-export");

test("safeName keeps generated project folders filesystem-safe", () => {
  assert.equal(safeName("customer api / v1"), "customer-api-v1");
  assert.equal(safeName(""), "muleforge-project");
});

test("desktopPath resolves an existing Desktop directory when available", () => {
  const value = desktopPath();
  assert.ok(value === null || /Desktop|desktop/.test(value));
});
