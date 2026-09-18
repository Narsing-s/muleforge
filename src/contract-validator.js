const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const METHODS = new Set(["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]);

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

module.exports = { validateContract };
