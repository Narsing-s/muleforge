const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

function load(file) {
  const text = fs.readFileSync(path.resolve(file), "utf8");
  return YAML.parse(text) || {};
}
function mapOps(model) {
  return new Map((model.operations || []).map(op => [`${String(op.method || "").toUpperCase()} ${op.path}`, op]));
}
function fieldMap(op) {
  const fields = [...(op?.requestFields || []), ...(op?.responseFields || []), ...(op?.fields || [])];
  return new Set(fields.map(f => typeof f === "string" ? f : (f?.name || f?.field || f?.key)).filter(Boolean).map(String));
}
function breakingChanges(oldModel, newModel) {
  const changes = [];
  const oldOps = mapOps(oldModel), newOps = mapOps(newModel);
  for (const [key, oldOp] of oldOps) {
    if (!newOps.has(key)) {
      changes.push({ type: "operation-removed", key, severity: "breaking", detail: `${key} was removed` });
      continue;
    }
    const next = newOps.get(key);
    if (String(oldOp.successStatus || "") !== String(next.successStatus || "")) {
      changes.push({ type: "success-status-changed", key, severity: "breaking", detail: `${oldOp.successStatus || "default"} -> ${next.successStatus || "default"}` });
    }
    if (oldOp.security !== next.security && oldOp.security != null && next.security != null) {
      changes.push({ type: "security-changed", key, severity: "breaking", detail: `${oldOp.security} -> ${next.security}` });
    }
    const oldReq = fieldMap(oldOp), newReq = fieldMap(next);
    for (const field of oldReq) if (!newReq.has(field)) changes.push({ type: "field-removed", key, field, severity: "breaking", detail: `Field ${field} was removed` });
    const oldRequired = new Set((oldOp.requestFields || []).filter(f => typeof f === "object" && f.required).map(f => f.name || f.field || f.key).filter(Boolean).map(String));
    const newRequired = new Set((next.requestFields || []).filter(f => typeof f === "object" && f.required).map(f => f.name || f.field || f.key).filter(Boolean).map(String));
    for (const field of newRequired) if (!oldRequired.has(field)) changes.push({ type: "required-field-added", key, field, severity: "breaking", detail: `Required request field ${field} was added` });
  }
  return changes;
}
function runBreakingCheck(oldFile, newFile) {
  const changes = breakingChanges(load(oldFile), load(newFile));
  return { breaking: changes.length > 0, changes };
}
module.exports = { breakingChanges, runBreakingCheck };
