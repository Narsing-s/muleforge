const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

function slug(value) {
  return String(value || "mule-api").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mule-api";
}

function readRequirementDocument(file) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error(`Requirement document not found: ${file}`);
  const ext = path.extname(full).toLowerCase();
  if ([".txt", ".md", ".markdown", ".csv", ".html", ".htm"].includes(ext)) {
    return fs.readFileSync(full, "utf8").replace(/<[^>]+>/g, " ").replace(/\r/g, "");
  }
  if ([".json"].includes(ext)) {
    const value = JSON.parse(fs.readFileSync(full, "utf8"));
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  if ([".yaml", ".yml"].includes(ext)) {
    const value = YAML.parse(fs.readFileSync(full, "utf8"));
    return YAML.stringify(value);
  }
  throw new Error(`Unsupported requirement document format: ${ext || "unknown"}. Use .txt, .md, .json, .yaml/.yml, or .html. No external service is required.`);
}

function parseEndpoints(text) {
  const found = [];
  const re = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s,.;:)]+)/gi;
  let match;
  while ((match = re.exec(text))) found.push({ method: match[1].toUpperCase(), path: match[2].replace(/[.)]+$/, "") });
  return [...new Map(found.map(e => [`${e.method} ${e.path}`, e])).values()];
}

function inferProjectName(text, file) {
  const match = text.match(/(?:project|application|api)\s*(?:name|called|named)\s*[:\-]?\s*["']?([A-Za-z][A-Za-z0-9 _-]{2,60})/i);
  if (match) return slug(match[1]);
  const title = String(text).split(/\n/).find(line => /^#\s+/.test(line));
  if (title) return slug(title.replace(/^#+\s*/, "").replace(/api$/i, ""));
  return slug(path.basename(file, path.extname(file)));
}

function inferFields(text, endpoint) {
  const lower = text.toLowerCase();
  const common = [];
  for (const field of ["id", "customerId", "accountId", "name", "firstName", "lastName", "email", "phone", "mobileNumber", "address", "amount", "status", "date", "createdAt", "updatedAt"]) {
    if (new RegExp(`\\b${field.replace(/[A-Z]/g, m => `[${m.toLowerCase()}${m}]`)}\\b`, "i").test(text)) common.push(field);
  }
  const fieldLine = text.match(/(?:request|input|payload|fields?)\s*[:\-]\s*([^\n]+)/i);
  if (fieldLine) common.push(...fieldLine[1].split(/,|\band\b/i).map(v => v.trim().split(/[:(]/)[0].replace(/[^A-Za-z0-9_]/g, "")).filter(Boolean));
  const unique = [...new Set(common)];
  const method = String(endpoint.method).toUpperCase();
  return method === "GET" || method === "DELETE" ? unique.filter(v => /id|Id|status|date|name/i.test(v)) : unique;
}

function inferValidation(text, fields) {
  const rules = [];
  for (const field of fields) {
    if (new RegExp(`${field}[^\\n]{0,60}(required|mandatory|must be provided|cannot be empty)`, "i").test(text) || new RegExp(`(?:required|mandatory)[^\\n]{0,60}${field}`, "i").test(text)) rules.push(`${field} is required`);
    if (field.toLowerCase().includes("email") && /email/.test(text.toLowerCase())) rules.push("email must be a valid email address");
  }
  if (/positive|greater than zero|must be >\s*0/i.test(text)) rules.push("numeric values must be greater than zero");
  return [...new Set(rules)];
}

function inferErrors(text) {
  const errors = [];
  const rules = [
    [/not found|does not exist|no customer|no record/i, "Resource not found returns 404"],
    [/duplicate|already exists|existing email|unique constraint/i, "Duplicate resource returns 409"],
    [/invalid|validation|bad request|required field/i, "Invalid request returns 400"],
    [/unauthorized|authentication required/i, "Unauthorized requests return 401"],
    [/forbidden|not allowed/i, "Forbidden requests return 403"],
    [/timeout|timed out/i, "Downstream timeout returns 504"],
    [/connection|unavailable|downstream|dependency/i, "Downstream failure returns 503"],
    [/unexpected|internal error|system error/i, "Unexpected errors return 500"]
  ];
  for (const [pattern, message] of rules) if (pattern.test(text)) errors.push(message);
  if (!errors.length) errors.push("Unexpected errors return 500");
  return [...new Set(errors)];
}

function inferConnectors(text) {
  const lower = text.toLowerCase();
  const connectors = ["http"];
  if (/snowflake/.test(lower)) connectors.push("snowflake");
  else if (/\b(mysql|postgres|postgresql|oracle|database|sql)\b/.test(lower)) connectors.push("database");
  if (/\bsftp\b|file transfer/.test(lower)) connectors.push("sftp");
  if (/ibm\s*mq|queue manager/.test(lower)) connectors.push("ibm-mq");
  if (/anypoint\s*mq/.test(lower)) connectors.push("anypoint-mq");
  if (/object\s*store|objectstore|cache/.test(lower)) connectors.push("object-store");
  return [...new Set(connectors)];
}

function analyzeRequirementDocument(text, file = "requirement.txt") {
  const endpoints = parseEndpoints(text);
  if (!endpoints.length) throw new Error("No HTTP operations were detected. Add endpoints such as GET /customers or POST /customers to the requirement document.");
  const projectName = inferProjectName(text, file);
  const errors = inferErrors(text);
  const operations = endpoints.map(endpoint => {
    const requestFields = inferFields(text, endpoint);
    const responseFields = [...new Set([...requestFields, ...(endpoint.method === "POST" ? ["id", "status"] : [])])];
    return {
      name: `${endpoint.method.toLowerCase()}${slug(endpoint.path).replace(/-/g, "_")}`,
      method: endpoint.method,
      path: endpoint.path,
      requestFields,
      responseFields,
      validation: inferValidation(text, requestFields),
      successStatus: endpoint.method === "POST" ? 201 : 200,
      errors
    };
  });
  return {
    requirement: text.trim(),
    project: { name: projectName, artifactId: projectName, groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" },
    api: { name: projectName, version: "v1", type: "System API", specification: "RAML", basePath: "/api/v1" },
    connectors: inferConnectors(text),
    operations,
    decisions: ["Authentication and deployment credentials are intentionally left as secure-property placeholders.", "Backend connection details are not requested during requirement analysis."],
    testing: { munit: true },
    deployment: { target: "none" }
  };
}

module.exports = { readRequirementDocument, analyzeRequirementDocument };
