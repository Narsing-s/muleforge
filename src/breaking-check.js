const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

function load(file) {
  return YAML.parse(fs.readFileSync(path.resolve(file), "utf8")) || {};
}
function mapOps(model) {
  return new Map((model.operations || []).map(op => [`${String(op.method || "").toUpperCase()} ${op.path}`, op]));
}
function normalizedFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map(field => typeof field === "string"
    ? { name: field, type: "string", required: false, enum: [] }
    : field && typeof field === "object"
      ? { name: field.name || field.field || field.key, type: String(field.type || "string").toLowerCase(), required: Boolean(field.required), enum: Array.isArray(field.enum) ? field.enum.map(String) : [] }
      : null).filter(Boolean).filter(field => field.name).map(field => ({ ...field, name: String(field.name) }));
}
function fieldMap(fields) { return new Map(normalizedFields(fields).map(field => [field.name, field])); }
function compareFields(changes, key, kind, oldFields, newFields) {
  const oldMap = fieldMap(oldFields), newMap = fieldMap(newFields);
  for (const [name, oldField] of oldMap) {
    if (!newMap.has(name)) changes.push({ type: `${kind}-field-removed`, legacyType: "field-removed", key, field: name, severity: "breaking", detail: `${kind} field ${name} was removed` });
    else {
      const next = newMap.get(name);
      if (oldField.type !== next.type) changes.push({ type: `${kind}-field-type-changed`, key, field: name, severity: "breaking", detail: `${kind} field ${name} type changed from ${oldField.type} to ${next.type}` });
      if (!oldField.required && next.required) changes.push({ type: "required-field-added", key, field: name, severity: "breaking", detail: `${kind} field ${name} became required` });
      if (oldField.enum.length && next.enum.length && oldField.enum.some(v => !next.enum.includes(v))) changes.push({ type: `${kind}-enum-value-removed`, key, field: name, severity: "breaking", detail: `${kind} field ${name} removed enum values` });
    }
  }
  for (const [name, next] of newMap) if (!oldMap.has(name) && next.required) changes.push({ type: "required-field-added", key, field: name, severity: "breaking", detail: `Required ${kind} field ${name} was added` });
}
function parameterNames(pathValue) {
  return new Set([...String(pathValue || "").matchAll(/\{([^}]+)\}/g)].map(match => match[1]));
}
function breakingChanges(oldModel, newModel) {
  const changes = [], oldOps = mapOps(oldModel), newOps = mapOps(newModel);
  for (const [key, oldOp] of oldOps) {
    if (!newOps.has(key)) { changes.push({ type: "operation-removed", key, severity: "breaking", detail: `${key} was removed` }); continue; }
    const next = newOps.get(key);
    if (String(oldOp.successStatus || "") !== String(next.successStatus || "")) changes.push({ type: "success-status-changed", key, severity: "breaking", detail: `${oldOp.successStatus || "default"} -> ${next.successStatus || "default"}` });
    const oldSecurity = String(oldOp.security || "none").toLowerCase(), newSecurity = String(next.security || "none").toLowerCase();
    if (oldSecurity !== newSecurity) changes.push({ type: "security-changed", key, severity: "breaking", detail: `${oldSecurity} -> ${newSecurity}` });
    const oldParams = parameterNames(oldOp.path), newParams = parameterNames(next.path);
    for (const param of oldParams) if (!newParams.has(param)) changes.push({ type: "path-parameter-removed", key, field: param, severity: "breaking", detail: `Path parameter ${param} was removed` });
    for (const param of newParams) if (!oldParams.has(param)) changes.push({ type: "path-parameter-added", key, field: param, severity: "breaking", detail: `Path parameter ${param} was added` });
    compareFields(changes, key, "request", oldOp.requestFields || oldOp.fields || [], next.requestFields || next.fields || []);
    compareFields(changes, key, "response", oldOp.responseFields || [], next.responseFields || []);\n    const oldPagination = Boolean(oldOp.pagination);\n    const newPagination = Boolean(next.pagination);\n    if (oldPagination && !newPagination) changes.push({ type: "pagination-removed", key, severity: "breaking", detail: "Pagination policy was removed" });\n    const oldIdempotency = Boolean(oldOp.idempotency);\n    const newIdempotency = Boolean(next.idempotency);\n    if (oldIdempotency && !newIdempotency) changes.push({ type: "idempotency-removed", key, severity: "breaking", detail: "Idempotency policy was removed" });
  }
  return changes;
}
function runBreakingCheck(oldFile, newFile) { const changes = breakingChanges(load(oldFile), load(newFile)); return { breaking: changes.length > 0, changes }; }
module.exports = { breakingChanges, runBreakingCheck };
