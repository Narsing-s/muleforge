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
    ? { name: field, type: "string", required: false }
    : field && typeof field === "object"
      ? { name: field.name || field.field || field.key, type: String(field.type || "string").toLowerCase(), required: Boolean(field.required) }
      : null).filter(Boolean).filter(field => field.name).map(field => ({ ...field, name: String(field.name) }));
}
function fieldMap(fields) { return new Map(normalizedFields(fields).map(field => [field.name, field])); }
function compareFields(changes, key, kind, oldFields, newFields) {
  const oldMap = fieldMap(oldFields), newMap = fieldMap(newFields);
  for (const [name, oldField] of oldMap) {
    if (!newMap.has(name)) changes.push({ type: `${kind}-field-removed`, key, field: name, severity: "breaking", detail: `${kind} field ${name} was removed` });
    else if (oldField.type !== newMap.get(name).type) changes.push({ type: `${kind}-field-type-changed`, key, field: name, severity: "breaking", detail: `${kind} field ${name} type changed from ${oldField.type} to ${newMap.get(name).type}` });
  }
  if (kind === "request") {
    for (const [name, next] of newMap) if (next.required && (!oldMap.has(name) || !oldMap.get(name).required)) changes.push({ type: "required-field-added", key, field: name, severity: "breaking", detail: `Required request field ${name} was added` });
  } else {
    for (const [name, next] of newMap) if (next.required && !oldMap.has(name)) changes.push({ type: "required-response-field-added", key, field: name, severity: "breaking", detail: `Required response field ${name} was added` });
  }
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
    compareFields(changes, key, "response", oldOp.responseFields || [], next.responseFields || []);
  }
  return changes;
}
function runBreakingCheck(oldFile, newFile) { const changes = breakingChanges(load(oldFile), load(newFile)); return { breaking: changes.length > 0, changes }; }
module.exports = { breakingChanges, runBreakingCheck };
