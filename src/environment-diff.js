const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const SECRET = /(password|secret|token|client_secret|private_key|api[_-]?key|credential)/i;

function load(file) {
  const value = YAML.parse(fs.readFileSync(path.resolve(file), "utf8")) || {};
  return value;
}

function flatten(value, prefix = "", out = {}) {
  if (Array.isArray(value)) return value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out)), out;
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out[prefix] = value;
  return out;
}

function environmentDiff(fromFile, toFile) {
  const a = flatten(load(fromFile));
  const b = flatten(load(toFile));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes = [];

  for (const key of [...keys].sort()) {
    const av = a[key];
    const bv = b[key];
    if (JSON.stringify(av) === JSON.stringify(bv)) continue;
    const sensitive = SECRET.test(key);
    changes.push({
      key,
      status: av === undefined ? "added" : bv === undefined ? "removed" : "changed",
      from: sensitive && av !== undefined ? "[REDACTED]" : av,
      to: sensitive && bv !== undefined ? "[REDACTED]" : bv
    });
  }

  return { from: path.resolve(fromFile), to: path.resolve(toFile), changes, changed: changes.length > 0 };
}

module.exports = { environmentDiff };