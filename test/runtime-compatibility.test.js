const test = require("node:test");
const assert = require("node:assert/strict");
const { checkRuntimeCompatibility } = require("../src/runtime-compatibility");

test("runtime compatibility validates declared Java and Mule runtime", () => {
  const r = checkRuntimeCompatibility({ project: { java: "17", muleRuntime: "4.9.0" } });
  assert.equal(r.valid, true);
});

test("runtime compatibility flags missing runtime declarations", () => {
  const r = checkRuntimeCompatibility({ project: {} });
  assert.equal(r.valid, false);
});