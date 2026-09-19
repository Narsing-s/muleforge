const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const METHODS = new Set(["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]);
const FIELD_TYPES = new Set(["string","integer","number","boolean","date","date-only","datetime","array","object"]);
const ERROR_STATUSES = new Set([400,401,403,404,409,422,429,500,502,503,504]);

function validateContract(file = "muleforge.yaml") {
  const absolute = path.resolve(file);
  const root = path.resolve(path.dirname(file));
  const cfg = YAML.parse(fs.readFileSync(absolute, "utf8")) || {};
  const ops = Array.isArray(cfg.operations) ? cfg.operations : [];
  const errors = [];
  const warnings = [];
  const seen = new Set();

  for (const op of ops) {
    const method = String(op.method || "").toUpperCase();
    const route = String(op.path || "");
    const name = String(op.name || "").trim();

    if (!name) errors.push(`Operation is missing a name: ${method} ${route}`);
    if (!METHODS.has(method)) errors.push(`Unsupported HTTP method for ${name || route}: ${method || "(missing)"}`);
    if (!route) errors.push(`Operation is missing a path: ${name || method}`);
    if (route && !route.startsWith("/")) errors.push(`Operation path must start with '/': ${name || route}`);
    if (route && !/^[A-Za-z0-9_./{}:-]+$/.test(route)) warnings.push(`Unusual route characters: ${route}`);

    const key = method + " " + route;
    if (seen.has(key)) errors.push(`Duplicate route: ${key}`);
    seen.add(key);

    if (op.successStatus !== undefined && !/^[1-5][0-9][0-9]$/.test(String(op.successStatus))) {
      errors.push(`Invalid successStatus for ${name || route}`);
    }
  }

  if (!ops.length) errors.push("At least one API operation is required.");
  if (!fs.existsSync(path.join(root, "src/main/resources/api"))) warnings.push("RAML output directory does not exist yet.");

  return { valid: errors.length === 0, errors, warnings, operationCount: ops.length };
}

function validateOperationPolicies(operations = []) {
  const errors = [];
  const warnings = [];
  for (const op of operations) {
    const name = String(op.name || op.path || "operation");
    const method = String(op.method || "").toUpperCase();
    if (op.retry != null) {
      if (typeof op.retry !== "object") errors.push(`${name}: retry must be an object.`);
      else {
        if (op.retry.maxRetries != null && (!Number.isInteger(Number(op.retry.maxRetries)) || Number(op.retry.maxRetries) < 1)) errors.push(`${name}: retry.maxRetries must be a positive integer.`);
        if (op.retry.millisBetweenRetries != null && (!Number.isInteger(Number(op.retry.millisBetweenRetries)) || Number(op.retry.millisBetweenRetries) < 0)) errors.push(`${name}: retry.millisBetweenRetries must be a non-negative integer.`);
      }
    }
    if (op.pagination) {
      if (!["GET"].includes(method)) errors.push(`${name}: pagination is supported only for GET operations.`);
      if (typeof op.pagination !== "object") errors.push(`${name}: pagination must be an object.`);
      else {
        if (op.pagination.defaultPageSize != null && Number(op.pagination.defaultPageSize) < 1) errors.push(`${name}: pagination.defaultPageSize must be positive.`);
        if (op.pagination.maxPageSize != null && Number(op.pagination.maxPageSize) < 1) errors.push(`${name}: pagination.maxPageSize must be positive.`);
        if (Number(op.pagination.defaultPageSize) > Number(op.pagination.maxPageSize)) errors.push(`${name}: pagination.defaultPageSize cannot exceed maxPageSize.`);
      }
    }
    if (op.idempotency && !["POST","PUT","PATCH"].includes(method)) errors.push(`${name}: idempotency is intended for POST, PUT or PATCH.`);
    if (op.transaction && !["POST","PUT","PATCH","DELETE"].includes(method)) errors.push(`${name}: transaction is intended for write operations.`);
    if (op.security && !["none","client-id","oauth2","basic"].includes(String(op.security).toLowerCase())) errors.push(`${name}: unsupported security mode.`);
    if (op.rateLimit != null) {
      const r = op.rateLimit;
      if (typeof r !== "object") errors.push(`${name}: rateLimit must be an object.`);
      else {
        if (r.requests != null && (!Number.isInteger(Number(r.requests)) || Number(r.requests) < 1)) errors.push(`${name}: rateLimit.requests must be a positive integer.`);
        if (r.periodSeconds != null && (!Number.isInteger(Number(r.periodSeconds)) || Number(r.periodSeconds) < 1)) errors.push(`${name}: rateLimit.periodSeconds must be a positive integer.`);
      }
    }
    if (op.timeout != null && (!Number.isInteger(Number(op.timeout)) || Number(op.timeout) < 1)) {
      errors.push(`${name}: timeout must be a positive integer in milliseconds.`);
    }
    if (op.idempotency === true) warnings.push(`${name}: idempotency is enabled; configure a persistent store for production-scale deduplication.`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateContract, validateDeployment, validateOperationPolicies };


function validateDeployment(deployment = {}) {
  const errors = [];
  const warnings = [];
  const target = String(deployment.target || "").toLowerCase();
  const allowed = ["none", "cloudhub", "cloudhub2", "rtf", "onprem"];
  if (deployment.target && !allowed.includes(target)) errors.push("deployment.target must be one of: " + allowed.join(", "));
  const replicas = deployment.replicas ?? deployment.replicaCount;
  if (replicas != null && (!Number.isInteger(Number(replicas)) || Number(replicas) < 1)) errors.push("deployment.replicas must be a positive integer.");
  const vCores = deployment.vCores ?? deployment.vcores;
  if (vCores != null && (!Number.isFinite(Number(vCores)) || Number(vCores) <= 0)) errors.push("deployment.vCores must be greater than zero.");
  if (target === "cloudhub2" || target === "rtf") {
    if (!deployment.environment) errors.push(target + " deployment requires environment.");
    if (!deployment.target) errors.push(target + " deployment requires target.");
  }
  if (target === "cloudhub2") {
    const validVCores = [0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
    if (vCores != null && !validVCores.includes(Number(vCores))) {
      errors.push("cloudhub2 deployment.vCores must be one of: " + validVCores.join(", ") + ".");
    }
    if (deployment.autoscaling === false && replicas == null) {
      warnings.push("cloudhub2 deployment with autoscaling disabled should specify replicas.");
    }
  }
  if (target === "onprem" && deployment.targetType && !["server","serverGroup","cluster"].includes(deployment.targetType)) {
    errors.push("onprem deployment.targetType must be server, serverGroup, or cluster.");
  }
  if (target === "cloudhub2" && deployment.version && /SNAPSHOT$/i.test(String(deployment.version)) && deployment.production === true) {
    errors.push("CloudHub 2 production deployments must not use SNAPSHOT application versions.");
  }
  return { valid: errors.length === 0, errors, warnings };
}
