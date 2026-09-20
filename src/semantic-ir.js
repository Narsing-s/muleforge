const CONNECTOR_ALIASES = {
  http: "http", rest: "http", https: "http",
  db: "database", database: "database", mysql: "database", postgres: "database", postgresql: "database", oracle: "database",
  snowflake: "snowflake",
  sftp: "sftp",
  "ibm mq": "ibm-mq", "ibm-mq": "ibm-mq", ibmmq: "ibm-mq",
  "anypoint mq": "anypoint-mq", "anypoint-mq": "anypoint-mq", anypointmq: "anypoint-mq",
  "object store": "object-store", "object-store": "object-store", objectstore: "object-store",
  file: "file", email: "email", jms: "jms", kafka: "kafka", salesforce: "salesforce"
};
const CONNECTOR_SET = new Set(Object.values(CONNECTOR_ALIASES));
const METHODS = new Set(["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]);
const FIELD_TYPES = new Set(["string","integer","number","boolean","object","array","date","datetime","binary"]);
const SUCCESS_STATUSES = new Set([200,201,202,203,204,206]);
const ERROR_STATUSES = new Set([400,401,403,404,405,409,415,422,429,500,502,503,504]);

function normalizeConnector(value) {
  const key = String(value || "http").trim().toLowerCase().replace(/_/g, "-").replace(/\\s+/g, " ");
  return CONNECTOR_ALIASES[key] || key;
}
function normalizeField(f) {
  if (typeof f === "string") return {name:f,type:"string",required:false};
  return {
    name:String(f?.name||f?.field||"field"),
    type:String(f?.type||"string").toLowerCase(),
    required:Boolean(f?.required),
    description:f?.description,
    enum:Array.isArray(f?.enum)?f.enum.map(String):undefined
  };
}
function normalizeStatus(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}
function buildIntegrationIR(config={}) {
  return {
    version:"1.1",
    project:config.project||{},
    api:config.api||{},
    operations:(config.operations||[]).map((op,i)=>({
      id:op.name||`operation-${i+1}`,
      method:String(op.method||"GET").toUpperCase(),
      path:String(op.path||"/"),
      connector:normalizeConnector(op.connector||"http"),
      requestFields:(op.requestFields||op.fields||[]).map(normalizeField),
      responseFields:(op.responseFields||[]).map(normalizeField),
      validation:Array.isArray(op.validation)?op.validation:[],
      errors:Array.isArray(op.errors)?op.errors:[],
      security:op.security||null,
      successStatus:normalizeStatus(op.successStatus, op.method==="POST"?201:200),
      errorStatuses:Array.isArray(op.errorStatuses)?op.errorStatuses.map(Number):[],
      policies:{
        retry:op.retry||null,
        pagination:op.pagination||null,
        idempotency:op.idempotency||false,
        transaction:op.transaction||false
      }
    })),
    connectors:[...(config.connectors||[])].map(normalizeConnector),
    events:Array.isArray(config.events)?config.events:[],
    dependencies:config.dependencies||{},
    nfr:config.nfr||config.nonFunctionalRequirements||{}
  };
}
function validateFields(fields, label, errors) {
  const seen = new Set();
  for (const field of fields || []) {
    if (!field || !field.name || String(field.name).trim() === "") errors.push(`${label} field must have a name`);
    const name = String(field?.name || "").trim().toLowerCase();
    if (name && seen.has(name)) errors.push(`Duplicate ${label.toLowerCase()} field: ${field.name}`);
    if (name) seen.add(name);
    if (!FIELD_TYPES.has(String(field?.type || "string").toLowerCase())) errors.push(`Unsupported ${label.toLowerCase()} field type: ${field.type}`);
    if (field?.enum && !Array.isArray(field.enum)) errors.push(`${label} field enum must be an array: ${field.name}`);
  }
}
function validateIntegrationIR(ir={}) {
  const errors=[];
  if (!ir || typeof ir !== "object") return {valid:false,errors:["Integration IR must be an object"]};
  if (!Array.isArray(ir.operations)) errors.push("Integration IR operations must be an array");
  if (!Array.isArray(ir.connectors)) errors.push("Integration IR connectors must be an array");
  const connectors = new Set((ir.connectors||[]).map(normalizeConnector));
  const operationKeys = new Set();
  for (const op of ir.operations || []) {
    if (!METHODS.has(String(op.method||"").toUpperCase())) errors.push(`Unsupported method: ${op.method}`);
    if (typeof op.path !== "string" || !op.path.startsWith("/")) errors.push(`Invalid path: ${op.path}`);
    if (typeof op.path === "string" && /\\s/.test(op.path)) errors.push(`Path must not contain whitespace: ${op.path}`);
    const key = `${String(op.method||"").toUpperCase()} ${op.path}`;
    if (operationKeys.has(key)) errors.push(`Duplicate operation: ${key}`);
    operationKeys.add(key);
    const connector = normalizeConnector(op.connector);
    if (!CONNECTOR_SET.has(connector)) errors.push(`Unsupported connector: ${op.connector}`);
    else if (connectors.size && !connectors.has(connector)) errors.push(`Operation connector not declared in connectors: ${connector}`);
    validateFields(op.requestFields, "Request", errors);
    validateFields(op.responseFields, "Response", errors);
    const success = Number(op.successStatus);
    if (!SUCCESS_STATUSES.has(success)) errors.push(`Invalid success status for ${key}: ${op.successStatus}`);
    for (const status of op.errorStatuses || []) if (!ERROR_STATUSES.has(Number(status))) errors.push(`Invalid error status for ${key}: ${status}`);
    if (op.policies?.retry && typeof op.policies.retry !== "object") errors.push(`Retry policy must be an object for ${key}`);
    if (op.policies?.pagination && typeof op.policies.pagination !== "object") errors.push(`Pagination policy must be an object for ${key}`);
  }
  for (const connector of ir.connectors || []) if (!CONNECTOR_SET.has(normalizeConnector(connector))) errors.push(`Unsupported connector: ${connector}`);
  return {valid:errors.length===0,errors};
}
module.exports={buildIntegrationIR,validateIntegrationIR,normalizeField,normalizeConnector,CONNECTOR_SET};