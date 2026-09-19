const path = require("path");

function validateApiGovernance(model = {}) {
  const findings = [];
  const api = model.api || {};
  const operations = Array.isArray(model.operations) ? model.operations : [];

  const add = (severity, code, message, operation = null) =>
    findings.push({ severity, code, message, operation });

  if (!api.name) add("error", "API_NAME_REQUIRED", "api.name is required.");
  if (!api.version) add("warning", "API_VERSION_RECOMMENDED", "api.version should be declared.");
  if (!api.basePath || !String(api.basePath).startsWith("/")) {
    add("error", "BASE_PATH_INVALID", "api.basePath must start with '/'.");
  }

  const seen = new Set();
  for (const op of operations) {
    const method = String(op.method || "").toUpperCase();
    const route = String(op.path || "");
    const key = method + " " + route;

    if (!method || !["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].includes(method)) {
      add("error", "HTTP_METHOD_INVALID", "Operation must declare a supported HTTP method.", op.name || key);
    }
    if (!route.startsWith("/")) {
      add("error", "PATH_INVALID", "Operation path must start with '/'.", op.name || key);
    }
    if (seen.has(key)) add("error", "DUPLICATE_OPERATION", `Duplicate operation: ${key}`, op.name || key);
    seen.add(key);

    if (!op.name) add("warning", "OPERATION_NAME_MISSING", "Operation should have a stable name.", key);
    if (op.successStatus == null) add("warning", "SUCCESS_STATUS_MISSING", "Explicit successStatus is recommended.", op.name || key);
    if (method !== "GET" && method !== "DELETE" && !op.requestFields && !op.requestSchema) {
      add("warning", "REQUEST_SCHEMA_MISSING", "Mutating operations should declare requestFields or requestSchema.", op.name || key);
    }
    if (!op.responseFields && !op.responseSchema) {
      add("warning", "RESPONSE_SCHEMA_MISSING", "Operations should declare responseFields or responseSchema.", op.name || key);
    }
    if (method === "GET" && op.successStatus && Number(op.successStatus) !== 200) {
      add("warning", "GET_SUCCESS_STATUS", "GET operations normally use HTTP 200 unless the contract intentionally specifies otherwise.", op.name || key);
    }
    const errors = Array.isArray(op.errors) ? op.errors : [];
    if (!errors.length) add("warning", "ERROR_RESPONSES_MISSING", "Declare expected API error responses for predictable client behavior.", op.name || key);
    if (op.security && !["client-id","oauth2","basic","none"].includes(String(op.security).toLowerCase())) {
      add("error", "SECURITY_SCHEME_UNKNOWN", "Unsupported operation security scheme.", op.name || key);
    }
  }

  const errors = findings.filter(f => f.severity === "error");
  return {
    valid: errors.length === 0,
    summary: { errors: errors.length, warnings: findings.filter(f => f.severity === "warning").length, operations: operations.length },
    findings
  };
}

module.exports = { validateApiGovernance };