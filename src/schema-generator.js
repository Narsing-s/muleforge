function safeName(value) {
  return String(value || "field").replace(/[^A-Za-z0-9_-]/g, "");
}

function normalizeField(field, fallbackType = "string") {
  if (typeof field === "string") return { name: field, type: fallbackType, required: false };
  if (!field || typeof field !== "object") return null;
  const name = field.name || field.field || field.key;
  if (!name) return null;
  const rawType = String(field.type || fallbackType).toLowerCase();
  const typeMap = {
    int: "integer",
    long: "integer",
    integer: "integer",
    float: "number",
    double: "number",
    decimal: "number",
    number: "number",
    bool: "boolean",
    boolean: "boolean",
    date: "date-only",
    datetime: "datetime",
    "date-time": "datetime"
  };
  return {
    name: safeName(name),
    type: typeMap[rawType] || "string",
    required: Boolean(field.required),
    description: field.description ? String(field.description).replace(/\n/g, " ") : null
  };
}

function normalizeFields(fields = []) {
  return (Array.isArray(fields) ? fields : [])
    .map(field => normalizeField(field))
    .filter(Boolean)
    .filter(field => field.name);
}

function renderProperties(fields, indent = "            ") {
  const normalized = normalizeFields(fields);
  if (!normalized.length) return "";
  return normalized.map(field => {
    const description = field.description ? `\n${indent}  description: ${field.description}` : "";
    return `${indent}${field.name}:\n${indent}  type: ${field.type}\n${indent}  required: ${field.required}${description}`;
  }).join("\n");
}

module.exports = { normalizeField, normalizeFields, renderProperties };
