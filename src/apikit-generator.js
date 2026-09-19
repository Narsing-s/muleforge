function xml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function dwString(value) {
  return JSON.stringify(String(value ?? ""));
}
function fieldName(field) {
  return typeof field === "string" ? field : field && (field.name || field.field);
}
function responsePayload(op) {
  const fields = Array.isArray(op.responseFields) ? op.responseFields.map(fieldName).filter(Boolean) : [];
  const body = {};
  if (fields.length) for (const name of fields) body[name] = name === "status" ? "SUCCESS" : null;
  else body.status = "SUCCESS";
  return JSON.stringify(body);
}
function requestPayload(op) {
  const fields = Array.isArray(op.requestFields) ? op.requestFields.map(fieldName).filter(Boolean) : [];
  const body = {};
  for (const name of fields) body[name] = null;
  return JSON.stringify(body);
}
function errorHandlers(op) {
  return (Array.isArray(op.errors) ? op.errors : []).map((err, index) => {
    const type = typeof err === "object" ? (err.type || err.code || "ANY") : "ANY";
    const status = Number(typeof err === "object" ? (err.status || err.code || 500) : 500);
    const safeStatus = Number.isFinite(status) ? status : 500;
    return `      <on-error-continue type="${xml(type)}">
        <set-variable variableName="httpStatusCode" value="${safeStatus}" />
        <ee:transform doc:name="APIKit error response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ error: ${dwString(typeof err === "object" && err.description ? err.description : "Request failed")}, status: ${safeStatus} }]]></ee:set-payload></ee:message></ee:transform>
      </on-error-continue>`;
  }).join("\n");
}
function generateApiKitFlow(data = {}) {
  const base = String(data.basePath || "/api/v1").replace(/"/g, "&quot;");
  const implementations = (data.operations || []).map(op => {
    const method = String(op.method || "GET").toLowerCase();
    const route = String(op.path || "/");
    const apiKitPath = route.replace(/^\//, "").split("/").filter(Boolean).join("\\") || "";
    const suffix = ["post", "put", "patch"].includes(method) ? ":application\\json" : "";
    const request = ["post", "put", "patch"].includes(method) && (op.requestFields || []).length
      ? `    <ee:transform doc:name="APIKit request example"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
${requestPayload(op)}]]></ee:set-payload></ee:message></ee:transform>
`
      : "";
    const errors = errorHandlers(op);
    const handler = errors ? `    <error-handler>
${errors}
    </error-handler>
` : "";
    const status = Number(op.successStatus || (method === "post" ? 201 : 200));
    const safeStatus = Number.isFinite(status) ? status : 200;
    return `  <flow name="${xml(method + ":\\" + apiKitPath + suffix + ":api-config")}">
${request}    <ee:transform doc:name="APIKit response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
${responsePayload(op)}]]></ee:set-payload></ee:message></ee:transform>
    <set-variable variableName="httpStatusCode" value="${safeStatus}" />
${handler}  </flow>`;
  }).join("\n");
  return `  <flow name="${xml(data.artifactId + "-apikit-main")}">
    <http:listener config-ref="HTTP_Listener_config" path="${base}/*" allowedMethods="GET,POST,PUT,PATCH,DELETE,OPTIONS">
      <http:response statusCode="#[vars.httpStatusCode default 200]" />
    </http:listener>
    <apikit:router config-ref="api-config" />
  </flow>
${implementations}`;
}
function generateApiKitConfig(data = {}) {
  return `  <apikit:config name="api-config" raml="api/${xml(data.artifactId)}.raml" outboundHeadersMapName="outboundHeaders" httpStatusVarName="httpStatusCode" />`;
}
module.exports = { generateApiKitFlow, generateApiKitConfig };