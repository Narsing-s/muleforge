const { normalizeField } = require("./schema-generator");
function typeSchema(field) {
  const f=normalizeField(field)||{name:"field",type:"string"};
  const type=String(f.type||"string").toLowerCase();
  if(type==="array"){const items=typeof f.items==="string"?{type:f.items}:typeSchema(f.items||{type:"string"});return {type:"array",items};}
  if(type==="object"){const properties={};for(const child of f.fields||[]){const childField=normalizeField(child);if(childField)properties[childField.name]=typeSchema(childField);}const schema={type:"object",properties};const required=(f.fields||[]).map(normalizeField).filter(Boolean).filter(x=>x.required).map(x=>x.name);if(required.length)schema.required=required;return schema;}
  const mapped={integer:"integer",number:"number",boolean:"boolean",string:"string","date-only":"string",datetime:"string"}[type]||"string";
  const schema={type:mapped};if(type==="date-only")schema.format="date";if(type==="datetime")schema.format="date-time";if(Array.isArray(f.enum)&&f.enum.length)schema.enum=f.enum;if(f.description)schema.description=String(f.description);return schema;
}
function fieldsSchema(fields = []) {
  const properties = {}, required = [];
  for (const field of Array.isArray(fields) ? fields : []) {
    const f = typeof field === "string" ? { name: field } : field || {};
    if (!f.name) continue;
    properties[f.name] = { ...typeSchema(f), ...(f.description ? { description: String(f.description) } : {}) };
    if (f.required) required.push(f.name);
  }
  const schema = { type: "object", properties };
  if (required.length) schema.required = required;
  return schema;
}
function generateOpenApi(config = {}, options = {}) {
  const api = config.api || {}, project = config.project || {};
  const doc = { openapi: options.version || "3.0.3", info: { title: api.name || project.name || "Mule API", version: api.version || project.version || "v1" }, servers: [{ url: api.baseUri || api.basePath || "/api/v1" }], paths: {} };
  for (const op of config.operations || []) {
    if (!op.path || !op.method) continue;
    const method = String(op.method).toLowerCase(), item = doc.paths[op.path] ||= {};
    const operation = { operationId: op.name || method + op.path.replace(/[^A-Za-z0-9]+/g, "_"), responses: {} };
    if (op.description) operation.description = String(op.description);
    if ((op.requestFields || []).length && !["get","delete","head"].includes(method)) operation.requestBody = { required: true, content: { "application/json": { schema: fieldsSchema(op.requestFields) } } };
    const success = String(op.successStatus || (method === "post" ? 201 : 200));
    operation.responses[success] = { description: "Successful response", content: { "application/json": { schema: fieldsSchema(op.responseFields || []) } } };
    for (const err of op.errors || []) { const status = String(typeof err === "object" ? (err.status || err.code || 500) : 500); operation.responses[status] ||= { description: typeof err === "object" && err.description ? String(err.description) : "Error response" }; }
    if (op.security) { const s = String(op.security).toLowerCase() === "oauth2" ? "oauth2" : String(op.security).toLowerCase() === "basic" ? "basicAuth" : "clientId"; operation.security = [{ [s]: [] }]; }
    item[method] = operation;
  }
  const modes = new Set((config.operations || []).map(o => String(o.security || "").toLowerCase())), schemes = {};
  if (modes.has("oauth2")) schemes.oauth2 = { type: "oauth2", flows: { clientCredentials: { tokenUrl: "\${oauth2.tokenUrl}", scopes: {} } } };
  if (modes.has("basic")) schemes.basicAuth = { type: "http", scheme: "basic" };
  if (modes.has("client-id")) schemes.clientId = { type: "apiKey", in: "header", name: "client_id" };
  if (Object.keys(schemes).length) doc.components = { securitySchemes: schemes };
  return doc;
}
function openApiYaml(config = {}, options = {}) { return require("yaml").stringify(generateOpenApi(config, options)); }
module.exports = { generateOpenApi, openApiYaml };