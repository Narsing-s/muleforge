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

test("preserves wizard answers when operations were initially created without fields", () => {
  const model = buildRequirementModel("Create a customer API with POST /customers and GET /customers/{customerId}", {
    projectName: "customer-api",
    operations: [
      { method: "POST", path: "/customers" },
      { method: "GET", path: "/customers/{customerId}" }
    ],
    requestFields: ["name", "email", "mobileNumber"],
    responseFields: ["customerId", "customer details"],
    validation: ["name is required", "email must be valid", "mobileNumber is required"],
    errors: ["customer not found returns 404", "invalid request returns 400", "duplicate email returns 409", "unexpected errors return 500"],
    connectors: ["http", "database"]
  });

  assert.deepEqual(model.operations[0].requestFields, ["name", "email", "mobileNumber"]);
  assert.deepEqual(model.operations[0].responseFields, ["customerId", "customer details"]);
  assert.deepEqual(model.operations[0].validation, ["name is required", "email must be valid", "mobileNumber is required"]);
  assert.deepEqual(model.operations[0].errors, ["customer not found returns 404", "invalid request returns 400", "duplicate email returns 409", "unexpected errors return 500"]);
  assert.equal(model.operations[0].connector, "database");
  assert.equal(model.operations[1].connector, "database");
});


test("preserves meaningful requirement statements as stable traceable REQ items", () => {
  const model = buildRequirementModel([
    "# Customer API",
    "The API must validate customer email.",
    "- Duplicate email must return 409.",
    "- GET /customers/{customerId} returns customer details."
  ].join("\n"), { projectName: "customer-api" });

  assert.equal(model.requirements.length, 4);
  assert.deepEqual(model.requirements.map(x => x.id), ["REQ-001", "REQ-002", "REQ-003", "REQ-004"]);
  assert.equal(model.requirements[0].source, "requirement:line:1");
  assert.match(model.requirements[1].text, /validate customer email/i);
  assert.match(model.requirements[2].text, /409/);
});
