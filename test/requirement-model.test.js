const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRequirementModel } = require("../src/requirement-model");
const { normalizeBackendConnectors } = require("../src/create-command");

test("normalizes natural-language MySQL backend descriptions", () => {
  assert.deepEqual(normalizeBackendConnectors("MySQL database for storing patient information."), ["http", "database"]);
});

test("does not assign request body fields to GET and DELETE operations", () => {
  const model = buildRequirementModel("Hospital API", {
    projectName: "hospital-api",
    operations: [
      { method: "POST", path: "/api/patientregistration" },
      { method: "GET", path: "/api/patients" },
      { method: "GET", path: "/api/patients/{patientId}" },
      { method: "PATCH", path: "/api/patients/{patientId}" },
      { method: "DELETE", path: "/api/patients/{patientId}" }
    ],
    requestFields: ["patientId", "fullName", "dateOfBirth", "mobileNumber"],
    responseFields: ["patientId", "status"],
    validation: ["patientId must exist"],
    errors: ["404 when patient is not found"],
    connectors: ["http", "database"]
  });

  assert.deepEqual(model.operations[0].requestFields, ["patientId", "fullName", "dateOfBirth", "mobileNumber"]);
  assert.deepEqual(model.operations[1].requestFields, []);
  assert.deepEqual(model.operations[2].requestFields, []);
  assert.deepEqual(model.operations[3].requestFields, ["patientId", "fullName", "dateOfBirth", "mobileNumber"]);
  assert.deepEqual(model.operations[4].requestFields, []);
});
