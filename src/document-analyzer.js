const { inferApiLedArchitecture } = require("./architecture");
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");
const YAML = require("yaml");

function slug(value) {
  return String(value || "mule-api").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mule-api";
}
function cleanText(value) {
  return String(value || "").replace(/\u0000/g, " ").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function command(command, args) {
  try { return cp.execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch (_) { return null; }
}
function extractOffice(buffer, filename) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-office-"));
  const archive = path.join(dir, filename);
  fs.writeFileSync(archive, buffer);
  try {
    const ext = path.extname(filename).toLowerCase();
    const entries = ext === ".docx"
      ? ["word/document.xml"]
      : ext === ".pptx"
        ? ["ppt/slides/slide*.xml", "ppt/notesSlides/notesSlide*.xml"]
        : ["xl/sharedStrings.xml", "xl/worksheets/sheet*.xml"];
    const chunks = [];
    for (const entry of entries) {
      const a = command("unzip", ["-p", archive, entry]);
      const b = a || command("tar", ["-xOf", archive, entry]);
      if (b) chunks.push(b);
    }
    if (!chunks.length) throw new Error("Office extraction requires unzip or tar in the MuleForge runtime.");
    return cleanText(chunks.join("\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function extractDocumentBuffer(buffer, filename = "requirement.txt") {
  const ext = path.extname(filename).toLowerCase();
  if ([".txt",".md",".markdown",".csv"].includes(ext)) return { text: cleanText(buffer.toString("utf8")), type: ext.slice(1), source: filename };
  if ([".html",".htm"].includes(ext)) return { text: cleanText(buffer.toString("utf8").replace(/<[^>]+>/g, " ")), type: "html", source: filename };
  if (ext === ".json") { const v = JSON.parse(buffer.toString("utf8")); return { text: cleanText(typeof v === "string" ? v : JSON.stringify(v, null, 2)), type: "json", source: filename }; }
  if ([".yaml",".yml"].includes(ext)) { const v = YAML.parse(buffer.toString("utf8")); return { text: cleanText(YAML.stringify(v)), type: "yaml", source: filename }; }
  if (ext === ".pdf") {
    const file = path.join(os.tmpdir(), "muleforge-" + Date.now() + ".pdf"); fs.writeFileSync(file, buffer);
    try {
      const text = command("pdftotext", ["-layout", file]);
      if (!text) throw new Error("PDF extraction is unavailable. Install Poppler/pdftotext for PDF requirements.");
      return { text: cleanText(text), type: "pdf", source: filename };
    } finally { fs.rmSync(file, { force: true }); }
  }
  if ([".docx",".pptx",".xlsx"].includes(ext)) return { text: extractOffice(buffer, filename), type: ext.slice(1), source: filename };
  throw new Error("Unsupported requirement document format: " + (ext || "unknown") + ". Supported: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, JSON, YAML and HTML.");
}
function readRequirementDocument(file) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error("Requirement document not found: " + file);
  return extractDocumentBuffer(fs.readFileSync(full), path.basename(full)).text;
}
function parseEndpoints(text) {
  const found = [], re = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s,.;:)]+)/gi;
  let m; while ((m = re.exec(text))) found.push({ method: m[1].toUpperCase(), path: m[2].replace(/[.)]+$/, "") });
  return [...new Map(found.map(e => [e.method + " " + e.path, e])).values()];
}
function inferProjectName(text, file) {
  const m = text.match(/(?:project|application|api)\s*(?:name|called|named)\s*[:\-]?\s*["']?([A-Za-z][A-Za-z0-9 _-]{2,60})/i);
  if (m) return slug(m[1]);
  const title = String(text).split("\n").find(x => /^#\s+/.test(x));
  return title ? slug(title.replace(/^#+\s*/, "").replace(/api$/i, "")) : slug(path.basename(file, path.extname(file)));
}
function inferFieldType(name, annotation = "") {
  const raw = String(annotation || "").toLowerCase().trim();
  const explicit = raw.match(/(?:^|\b)(string|integer|int|long|number|decimal|float|double|boolean|bool|date|datetime|date-time|array|object)(?:\b|$)/i)?.[1]?.toLowerCase();
  if (explicit) {
    if (["int", "long"].includes(explicit)) return "integer";
    if (["float", "double", "decimal"].includes(explicit)) return "number";
    if (explicit === "bool") return "boolean";
    if (explicit === "date-time") return "datetime";
    if (explicit === "date") return "date-only";
    return explicit;
  }
  const value = String(name || "").toLowerCase();
  if (/^(is|has|can|should|enabled|active|deleted|verified|success)/.test(value) || /(flag|boolean)$/.test(value)) return "boolean";
  if (/(amount|price|rate|percent|percentage|balance|salary|total|average|score|latitude|longitude|quantity|count|number|age)$/.test(value)) return /(count|quantity|number|age)$/.test(value) ? "integer" : "number";
  if (/(date|dob|birthdate|startdate|enddate)$/.test(value)) return "date-only";
  if (/(datetime|timestamp|createdat|updatedat|createdon|updatedon)$/.test(value)) return "datetime";
  if (/(items|list|array|ids)$/.test(value)) return "array";
  return "string";
}

function inferFields(text, endpoint) {
  const candidates = [];
  const annotations = new Map();

  const addCandidate = (name, annotation = "") => {
    const clean = String(name || "").trim().replace(/\[\]/g, "[]");
    if (!/^[A-Za-z][A-Za-z0-9_.\[\]]*$/.test(clean)) return;
    candidates.push(clean);
    if (annotation) annotations.set(clean.toLowerCase(), annotation.trim());
  };

  for (const field of ["id","customerId","accountId","name","firstName","lastName","email","phone","mobileNumber","address","amount","status","date","createdAt","updatedAt"]) {
    if (new RegExp("\\b" + field.replace(/[A-Z]/g, m => "[" + m.toLowerCase() + m + "]") + "\\b", "i").test(text)) addCandidate(field);
  }

  for (const line of String(text || "").split("\n")) {
    if (!/(?:request|input|payload|fields?|required fields?)/i.test(line)) continue;
    const match = line.match(/(?:request|input|payload|fields?|required fields?)\s*[:\-]\s*(.+)$/i);
    if (!match) continue;
    for (const part of splitFieldParts(match[1])) {
      const piece = part.trim();
      if (!piece) continue;
      const m = piece.match(/^([A-Za-z][A-Za-z0-9_.\[\]]*)\s*(?::|\(|-)?\s*(.*?)\s*\)?$/);
      if (m) addCandidate(m[1], m[2] || "");
    }
  }

  function splitFieldParts(value) {
    const parts = [];
    let current = "", depth = 0;
    for (const ch of String(value || "")) {
      if (ch === "[") depth++;
      if (ch === "]") depth = Math.max(0, depth - 1);
      if (depth === 0 && ch === ",") { parts.push(current); current = ""; continue; }
      current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts.flatMap(part => /\s+and\s+/i.test(part) && !/\benum\s*[:=]/i.test(part) ? part.split(/\s+and\s+/i) : [part]);
  }

  const unique = [...new Set(candidates)].filter(Boolean);
  const selected = /^(GET|DELETE)$/i.test(endpoint.method)
    ? unique.filter(v => /id|status|date|name/i.test(v))
    : unique;

  const leafFields = selected.map(name => {
    const escaped = String(name).replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const annotationRequired = /(?:\brequired\b|\bmandatory\b|\bcannot be empty\b|\bmust be provided\b)/i.test(annotations.get(String(name).toLowerCase()) || "");
    const sentenceRequired = String(text || "").split(/[.\n;]/).some(sentence => {
      if (!/\b(required|mandatory|must be provided|cannot be empty)\b/i.test(sentence)) return false;
      const normalized = sentence.replace(/[^A-Za-z0-9_.\[\]]+/g, " ").toLowerCase();
      const normalizedField = escaped.toLowerCase();
      return new RegExp("(^|\\s)" + normalizedField + "(\\s|$)").test(normalized);
    });
    const required = annotationRequired || sentenceRequired;
    const annotation = annotations.get(String(name).toLowerCase()) || "";
    const enumMatch = annotation.match(/(?:enum|values?)\s*[:=]?\s*\[?([^\]]+)\]?/i);
    const enumValues = enumMatch
      ? enumMatch[1].split(/,|\|/).map(v => v.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean)
      : null;
    const field = { name, type: inferFieldType(name.replace(/\[\]/g, "").split(".").pop(), annotation), required };
    if (enumValues?.length) field.enum = enumValues;

    // Preserve explicit validation metadata in the existing field model.
    // These attributes are intentionally optional so requirements without
    // constraints continue to generate exactly the same contracts.
    const captureNumber = (pattern) => {
      const m = annotation.match(pattern);
      return m ? Number(m[1]) : undefined;
    };
    const captureText = (pattern) => {
      const m = annotation.match(pattern);
      return m ? m[1].trim().replace(/^[\"']|[\"']$/g, "") : undefined;
    };
    const minimum = captureNumber(/(?:min(?:imum)?|minimum)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
    const maximum = captureNumber(/(?:max(?:imum)?|maximum)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
    const minLength = captureNumber(/min(?:imum)?Length\s*[:=]\s*(\d+)/i);
    const maxLength = captureNumber(/max(?:imum)?Length\s*[:=]\s*(\d+)/i);
    const format = captureText(/format\s*[:=]\s*([A-Za-z][A-Za-z0-9_-]*)/i);
    const patternMatch = annotation.match(/pattern\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^,;]+))/i);
    const pattern = patternMatch ? (patternMatch[1] || patternMatch[2] || patternMatch[3]).trim().replace(/[.;]+$/, "") : undefined;
    const descriptionMatch = annotation.match(/(?:description|desc)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|(.+?))(?=\s+(?:enum|values?|format|pattern|min(?:imum)?Length|max(?:imum)?Length|min(?:imum)?|max(?:imum)?)\s*[:=]|$)/i);
    const description = descriptionMatch ? (descriptionMatch[1] || descriptionMatch[2] || descriptionMatch[3]).trim() : undefined;
    if (description) field.description = description.replace(/[.;]+$/, "").trim();
    if (minimum !== undefined) field.minimum = minimum;
    if (maximum !== undefined) field.maximum = maximum;
    if (minLength !== undefined) field.minLength = minLength;
    if (maxLength !== undefined) field.maxLength = maxLength;
    if (format) field.format = format;
    if (pattern) field.pattern = pattern;
    return field;
  });

  // Fold dotted/array paths into the existing nested-field model instead of
  // introducing another schema representation. Examples:
  // address.city: string
  // items[].sku: string
  const roots = new Map();
  const direct = [];
  for (const field of leafFields) {
    const parts = String(field.name).split(".");
    if (parts.length === 1) {
      if (!roots.has(parts[0])) roots.set(parts[0], field);
      else direct.push(field);
      continue;
    }
    const rootName = parts[0].replace(/\[\]$/, "");
    let root = roots.get(rootName);
    if (root && root.type === "string") {
      root.type = parts[0].endsWith("[]") ? "array" : "object";
      root.fields = [];
      if (root.type === "array") root.items = { type: "object", fields: root.fields };
    }
    if (!root) {
      root = { name: rootName, type: parts[0].endsWith("[]") ? "array" : "object", required: false, fields: [] };
      if (root.type === "array") root.items = { type: "object", fields: root.fields };
      roots.set(rootName, root);
    }
    const arrayRoot = parts[0].endsWith("[]");
    if (arrayRoot && root.type !== "array") {
      root.type = "array";
      root.items = { type: "object", fields: root.fields || [] };
    }
    const container = root.type === "array" ? root.items : root;
    if (!Array.isArray(container.fields)) container.fields = [];
    let cursor = container;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].replace(/\[\]$/, "");
      const isArray = parts[i].endsWith("[]");
      const last = i === parts.length - 1;
      if (last) {
        cursor.fields.push({ ...field, name: part });
      } else {
        let child = cursor.fields.find(x => x.name === part);
        if (!child) {
          child = { name: part, type: isArray ? "array" : "object", required: false, fields: [] };
          if (isArray) child.items = { type: "object", fields: child.fields };
          cursor.fields.push(child);
        }
        cursor = child.type === "array" ? child.items : child;
        if (!Array.isArray(cursor.fields)) cursor.fields = [];
      }
    }
  }

  for (const field of leafFields) {
    if (!String(field.name).includes(".") && !String(field.name).includes("[]") && roots.get(field.name) === field) direct.push(field);
  }
  return [...roots.values(), ...direct.filter(f => !roots.has(f.name))].filter((field, index, list) => list.findIndex(x => x.name === field.name) === index);
}
function inferValidation(text, fields) {
  const rules = [];
  for (const field of fields) {
    if (new RegExp(field + "[^\\n]{0,60}(required|mandatory|must be provided|cannot be empty)", "i").test(text) || new RegExp("(?:required|mandatory)[^\\n]{0,60}" + field, "i").test(text)) rules.push(field + " is required");
    if (/email/i.test(field) && /email/i.test(text)) rules.push("email must be a valid email address");
  }
  if (/positive|greater than zero|must be >\s*0/i.test(text)) rules.push("numeric values must be greater than zero");
  return [...new Set(rules)];
}
function inferErrors(text) {
  const rules = [
    [/not found|does not exist|no customer|no record/i, "Resource not found returns 404"],
    [/duplicate|already exists|unique constraint/i, "Duplicate resource returns 409"],
    [/invalid|validation|bad request|required field/i, "Invalid request returns 400"],
    [/unauthorized|authentication required/i, "Unauthorized requests return 401"],
    [/forbidden|not allowed/i, "Forbidden requests return 403"],
    [/timeout|timed out/i, "Downstream timeout returns 504"],
    [/connection|unavailable|downstream|dependency/i, "Downstream failure returns 503"],
    [/unexpected|internal error|system error/i, "Unexpected errors return 500"]
  ];
  const out = rules.filter(x => x[0].test(text)).map(x => x[1]); return [...new Set(out.length ? out : ["Unexpected errors return 500"])];
}
const CONNECTORS = [
  ["sftp", /\bsftp\b|secure file transfer/i],
  ["ibm-mq", /ibm\s*mq|websphere\s*mq|queue manager|\bMQ queue\b/i],
  ["anypoint-mq", /anypoint\s*mq/i],
  ["snowflake", /\bsnowflake\b/i],
  ["database", /\b(mysql|postgres|postgresql|oracle|database|sql)\b/i],
  ["object-store", /object\s*store|objectstore/i],
  ["http", /\bhttps?\b|\bREST\b|\bHTTP\b|\bAPI\b/i]
];
function inferConnectivity(text, source) {
  const out = [];
  const endpoint = (text.match(/(?:https?|jdbc):\/\/[^\s,)"']+/i) || [])[0]?.replace(/[.,;)]+$/, "") || null;
  const pathMatch = text.match(/(?:path|directory|folder|location)\s*(?:(?:is|=|:)\s*)?["']?([^\s"']+)/i);
  const queueMatch = text.match(/(?:queue(?!\s*manager)|destination)\s*(?:(?:name|is|=|:)\s*)?["']?([A-Za-z0-9._:/-]+)/i);
  const topicMatch = text.match(/topic\s*(?:(?:name|is|=|:)\s*)?["']?([A-Za-z0-9._:/-]+)/i);
  const scheduleMatch = text.match(/(?:every|each)\s+(\d+\s*(?:minutes?|hours?|seconds?|days?))/i) || text.match(/cron(?: expression)?\s*[:=]\s*([^\n]+)/i);
  const hostMatch = text.match(/(?:host|hostname|server)\s*(?:is|=|:)?\s*["']?([A-Za-z0-9._-]+)/i);
  const portMatch = text.match(/(?:port)\s*(?:is|=|:)\s*(\d{2,5})/i);
  const queueManagerMatch = text.match(/(?:queue\s*manager|queuemanager|QM)\s*(?:(?:name|is|=|:)\s*)?["']?([A-Za-z0-9._-]+)/i);
  const channelMatch = text.match(/(?:channel)\s*(?:(?:name|is|:)\s*)?["']?([A-Za-z0-9._-]+)/i);
  const accountNameMatch = text.match(/(?:account(?:\s*name)?|accountName)\s*(?:(?:is|=|:)\s*)?["']?([A-Za-z0-9._-]+)/i);
  const warehouseMatch = text.match(/(?:warehouse)\s*(?:(?:name|is|=|:)\s*)?["']?([A-Za-z0-9._-]+)/i);
  const databaseNameMatch = text.match(/(?:database(?:\s+name)?|db(?:\s+name)?)\s*(?:(?:is|=|:)\s*)?(?!host\b|port\b|name\b|schema\b)["']?([A-Za-z0-9_][A-Za-z0-9._-]*)/i);
  const schemaMatch = text.match(/(?:schema)\s*(?:(?:name|is|=|:)\s*)?["']?([A-Za-z0-9._-]+)/i);
  const roleMatch = text.match(/(?:role)\s*(?:(?:name|is|=|:)\s*)?["']?([A-Za-z0-9._-]+)/i);
  const auth = /oauth2|oauth 2/i.test(text) ? "oauth2" : /basic auth|basic authentication/i.test(text) ? "basic" : /client credentials/i.test(text) ? "client-credentials" : /api[- ]?key/i.test(text) ? "apikey" : /username.*password|user.*password/i.test(text) ? "username-password" : null;
  const add = (type, values) => out.push({ type, explicit: true, ...values, auth, source: source || "requirement" });
  for (const [type, re] of CONNECTORS) {
    if (!re.test(text)) continue;
    if (type === "http") add(type, { endpoint });
    else if (type === "sftp") add(type, { host: hostMatch?.[1] || null, port: portMatch ? Number(portMatch[1]) : null, path: pathMatch?.[1]?.replace(/[.,;)]+$/, "") || null, schedule: scheduleMatch?.[1] || null });
    else if (type === "ibm-mq") add(type, { host: hostMatch?.[1] || null, port: portMatch ? Number(portMatch[1]) : null, queueManager: queueManagerMatch?.[1] || null, channel: channelMatch?.[1] || null, queue: queueMatch?.[1]?.replace(/[.,;)]+$/, "") || null });
    else if (type === "anypoint-mq") add(type, { endpoint, queue: queueMatch?.[1]?.replace(/[.,;)]+$/, "") || null, topic: topicMatch?.[1]?.replace(/[.,;)]+$/, "") || null });
    else if (type === "database") add(type, {
      endpoint,
      host: hostMatch?.[1] || null,
      port: portMatch ? Number(portMatch[1]) : null,
      database: databaseNameMatch?.[1] || null
    });
    else if (type === "snowflake") add(type, {
      endpoint,
      host: hostMatch?.[1] || null,
      accountName: accountNameMatch?.[1] || null,
      warehouse: warehouseMatch?.[1] || null,
      database: databaseNameMatch?.[1] || null,
      schema: schemaMatch?.[1] || null,
      role: roleMatch?.[1]?.replace(/[.,;)]+$/, "") || null
    });
    else add(type, {});
  }
  return out;
}
function extractRequirements(text, source) {
  return cleanText(text).split("\n").map(x => x.trim()).filter(x => x && /\b(must|shall|required|should|need to|needs to|accept|reject|validate|send|receive|store|transform|schedule|invoke|publish|consume)\b/i.test(x))
    .slice(0, 200).map((value, i) => ({ id: "REQ-" + String(i + 1).padStart(3, "0"), text: value, source, location: { line: i + 1 } }));
}
function mergeDocuments(documents) {
  const seen = new Set(), requirements = [], connectivity = [], conflicts = [];
  for (const doc of documents) {
    for (const req of extractRequirements(doc.text, doc.name)) { const key = req.text.toLowerCase(); if (!seen.has(key)) { seen.add(key); requirements.push(req); } }
    connectivity.push(...inferConnectivity(doc.text, doc.name));
  }
  const byType = new Map();
  for (const c of connectivity) { if (!byType.has(c.type)) byType.set(c.type, []); byType.get(c.type).push(c); }
  for (const [type, values] of byType) {
    const fields = ["endpoint", "host", "port", "path", "queue", "topic", "queueManager", "channel", "schedule", "accountName", "warehouse", "database", "schema", "role"];
    const differences = fields
      .map(field => ({ field, values: [...new Set(values.map(v => v[field]).filter(v => v !== null && v !== undefined && v !== ""))] }))
      .filter(x => x.values.length > 1);
    if (differences.length) {
      conflicts.push({
        type: "connectivity",
        connector: type,
        message: "Conflicting explicit connectivity details across requirement documents.",
        differences,
        values,
        resolutionRequired: true
      });
    }
  }
  return { requirements, connectivity, conflicts };
}
function analyzeRequirementDocument(text, file = "requirement.txt", packageDocuments = null) {
  const docs = packageDocuments && packageDocuments.length ? packageDocuments : [{ name: file, text: cleanText(text), type: path.extname(file).slice(1) || "txt" }];
  const merged = mergeDocuments(docs);
  const combined = docs.map(d => d.text).join("\n\n");
  const endpoints = parseEndpoints(combined);
  const projectName = inferProjectName(combined, file);
  const errors = inferErrors(combined);
  const connectivity = merged.connectivity;
  const connectorIds = [...new Set(connectivity.map(c => c.type))];

  function operationSection(endpoint) {
    const escapedPath = endpoint.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const marker = new RegExp("\\b" + endpoint.method + "\\s+" + escapedPath + "(?=\\s|$|[.,;:)])", "i");
    const hit = marker.exec(combined);
    if (!hit) return "";
    const start = hit.index;
    const all = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s,.;:)]+/gi;
    all.lastIndex = start + hit[0].length;
    const next = all.exec(combined);
    return combined.slice(start, next ? next.index : Math.min(combined.length, start + 2500));
  }

  function evidenceForOperation(endpoint) {
    const window = operationSection(endpoint);
    const patterns = {
      "ibm-mq": "ibm\\s*mq|websphere\\s*mq|queue\\s*manager",
      "anypoint-mq": "anypoint\\s*mq",
      sftp: "\\bsftp\\b|secure\\s+file\\s+transfer",
      snowflake: "\\bsnowflake\\b",
      database: "\\b(mysql|postgres(?:ql)?|oracle|database|sql)\\b",
      "object-store": "object\\s*store|objectstore"
    };
    return connectivity.filter(c => c.type !== "http" && patterns[c.type] && new RegExp(patterns[c.type], "i").test(window));
  }

  function httpEvidenceForOperation(endpoint) {
    const window = operationSection(endpoint);
    const urls = window.match(/https?:\/\/[^\s,)"']+/gi) || [];
    return [...new Set(urls.map(url => url.replace(/[.,;)]+$/, "")))].map(endpointUrl => ({
      type: "http",
      explicit: true,
      endpoint: endpointUrl
    }));
  }

  function explicitConnectorForOperation(endpoint) {
    const window = operationSection(endpoint);
    const match = window.match(/(?:connector|integration|source|uses)\s*:\s*(http|database|mysql|postgres|postgresql|oracle|snowflake|sftp|ibm[- ]?mq|anypoint[- ]?mq|object[- ]?store|file|email|jms|kafka|salesforce)\b/i);
    if (!match) return null;
    const value = match[1].toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
    return value === "mysql" || value === "postgres" || value === "postgresql" || value === "oracle" ? "database" : value;
  }

  function operationConnector(endpoint) {
    const explicit = explicitConnectorForOperation(endpoint);
    if (explicit) return explicit;
    const nonHttp = [...new Set(connectivity.filter(c => c.type !== "http").map(c => c.type))];
    if (nonHttp.length === 0) return "http";
    const local = [...new Set(evidenceForOperation(endpoint).map(c => c.type))];
    if (local.length === 1) return local[0];
    return null;
  }

  function operationConnectivity(endpoint, type) {
    const local = evidenceForOperation(endpoint).filter(c => c.type === type);
    if (local.length === 1) return local[0];
    const global = connectivity.filter(c => c.type === type);
    return global.length === 1 ? global[0] : null;
  }

  const operations = endpoints.map(endpoint => {
    const operationText = operationSection(endpoint) || combined;
    const requestFields = inferFields(operationText, endpoint);
    const description = operationText
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .find(line => line.toLowerCase() !== (String(endpoint.method) + " " + String(endpoint.path)).toLowerCase() && !/^(?:connector|request|input|payload|fields?)\s*:/i.test(line) && !/^(?:use|using|publish|send|receive|connect|authenticate)\b/i.test(line)) || undefined;
    const connector = operationConnector(endpoint);
    const local = connector ? operationConnectivity(endpoint, connector) : null;
    const httpEvidence = httpEvidenceForOperation(endpoint);
    const globalHttp = connectivity.filter(x => x.type === "http" && x.endpoint);
    const httpLocal = httpEvidence.length === 1 ? httpEvidence[0] : (globalHttp.length === 1 ? globalHttp[0] : null);
    return {
      name: endpoint.method.toLowerCase() + slug(endpoint.path).replace(/-/g, "_"),
      method: endpoint.method,
      path: endpoint.path,
      connector,
      table: /\/products(?:\/|$)/i.test(endpoint.path) ? "PRODUCT" : /\/orders(?:\/|$)/i.test(endpoint.path) ? "ORDERS" : null,
      connectorAmbiguous: connector === null || (connector !== "http" && !local),
      description,
      downstreamEndpoint: httpLocal?.endpoint || null,
      schedule: local?.schedule || null,
      filePath: local?.path || null,
      destination: local ? (local.queue || local.topic || null) : null,
      requestFields,
      responseFields: [...new Set([...requestFields, ...(endpoint.method === "POST" ? ["id", "status"] : [])])],
      validation: inferValidation(combined, requestFields),
      successStatus: endpoint.method === "POST" ? 201 : 200,
      errors
    };
  });

  if (!operations.length && connectorIds.length) {
    const nonHttp = connectorIds.filter(x => x !== "http");
    const httpLocal = connectivity.find(x => x.type === "http" && x.endpoint) || null;
    operations.push({
      name: "integration-process",
      method: "POST",
      path: "/process",
      connector: nonHttp.length === 1 ? nonHttp[0] : (connectorIds.length === 1 ? connectorIds[0] : null),
      connectorAmbiguous: nonHttp.length > 1,
      downstreamEndpoint: httpLocal?.endpoint || null,
      requestFields: [],
      responseFields: [],
      validation: [],
      successStatus: 200,
      errors
    });
  }

  const operationConflicts = operations.filter(op => op.connectorAmbiguous).map(op => ({
    type: "operation-routing",
    operation: op.method + " " + op.path,
    candidates: [...new Set(connectivity.filter(c => c.type !== "http").map(c => c.type))],
    message: "Multiple non-HTTP connectors are present and the documents do not identify which connector belongs to this operation.",
    resolutionRequired: true
  }));

  const missingConfigurations = connectivity.flatMap(c => {
    const missing = [];
    if (["sftp", "ibm-mq", "anypoint-mq", "database"].includes(c.type) && !c.host && !c.endpoint) missing.push(c.type + " host/endpoint");
    if (c.type === "snowflake" && !c.accountName) missing.push("snowflake accountName");
    if (c.type === "snowflake" && !c.warehouse) missing.push("snowflake warehouse");
    if (c.type === "snowflake" && !c.database) missing.push("snowflake database");
    if (c.type === "snowflake" && !c.schema) missing.push("snowflake schema");
    if (c.type === "sftp" && !c.path) missing.push("sftp path");
    if (["ibm-mq", "anypoint-mq"].includes(c.type) && !c.queue && !c.topic) missing.push(c.type + " queue/destination");
    if (c.type === "ibm-mq" && !c.port) missing.push("ibm-mq port");
    if (c.type === "ibm-mq" && !c.queueManager) missing.push("ibm-mq queue manager");
    if (c.type === "ibm-mq" && !c.channel) missing.push("ibm-mq channel");
    return missing.map(item => ({ item, connector: c.type, source: c.source }));
  });
  missingConfigurations.push(...operationConflicts.map(op => ({ item: "connector mapping for " + op.operation, connector: "ambiguous", source: "requirement package" })));

  return {
    requirement: docs.map(d => "### SOURCE: " + d.name + "\n\n" + d.text).join("\n\n"),
    sourceDocuments: docs.map(d => ({ name: d.name, type: d.type, characters: d.text.length })),
    requirements: merged.requirements,
    project: { name: projectName, artifactId: projectName, groupId: "com.example", version: "1.0.0", muleRuntime: "4.9.0", java: "17" },
    schemas: merged.requirements.reduce((acc, r) => { if (r.fields && Array.isArray(r.fields)) acc.push(...r.fields); return acc; }, []).reduce((acc, f) => { const name = String(f.name || f.field || "").trim(); if (name && !acc.some(x => x.name === name)) acc.push({ name, type: f.type || "string", required: Boolean(f.required) }); return acc; }, []),
    api: { name: projectName, version: "v1", type: "System API", specification: "RAML", basePath: "/api/v1" },
    architecture: inferApiLedArchitecture({ text: combined, operations }),
    database: (() => {
      const db = connectivity.find(c => c.type === "database");
      if (!db) return undefined;
      const host = db.host || "localhost";
      const port = db.port || 3306;
      const name = db.database || null;
      return { type: "mysql", url: name ? "jdbc:mysql://" + host + ":" + port + "/" + name : null, host, port, name, table: "CUSTOMER" };
    })(),
    connectors: connectorIds.length ? connectorIds : ["http"],
    connectivity,
    operations,
    conflicts: [...merged.conflicts, ...operationConflicts],
    assumptions: ["Explicit connectivity in supplied documents is authoritative.", "Credentials and secrets are never copied into generated source.", "Missing connection values remain placeholders until explicitly resolved."],
    missingConfigurations,
    traceability: merged.requirements.map(r => ({ requirementId: r.id, source: r.source, targets: ["architecture", "implementation", "munit", "postman", "documentation"] })),
    decisions: ["Document-first generation: explicit requirement connectivity is authoritative.", "Conflicts are surfaced rather than silently resolved.", "Ambiguous operation-to-connector mappings block final export."],
    testing: { munit: true },
    deployment: { target: "none" }
  };
}
module.exports = { readRequirementDocument, extractDocumentBuffer, analyzeRequirementDocument, inferConnectivity, extractRequirements };