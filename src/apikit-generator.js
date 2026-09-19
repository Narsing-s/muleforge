function generateApiKitFlow(data) {
  const base = String(data.basePath || "/api/v1").replace(/"/g, "&quot;");
  const implementations = (data.operations || []).map(op => { const method=String(op.method||"GET").toLowerCase(), path=String(op.path||"/"), apiKitPath=path.replace(/^\//,"").split("/").filter(Boolean).join("\\") || "", suffix=["post","put","patch"].includes(method) ? ":application\\json" : ""; return `  <flow name="${method}:\\${apiKitPath}${suffix}:api-config">\n    <ee:transform doc:name="APIKit response"><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n${JSON.stringify(Object.fromEntries((op.responseFields||["status"]).map(f=>[typeof f==="string"?f:f.name||"field", f==="status" ? "SUCCESS" : null])))}]]></ee:set-payload></ee:message></ee:transform>\n    <set-variable variableName="httpStatusCode" value="${Number(op.successStatus || (method==="post"?201:200))}" />\n  </flow>`; }).join("\n"); return `  <flow name="${data.artifactId}-apikit-main">
    <http:listener config-ref="HTTP_Listener_config" path="${base}/*" allowedMethods="GET,POST,PUT,PATCH,DELETE,OPTIONS">
      <http:response statusCode="#[vars.httpStatusCode default 200]" />
    </http:listener>
    <apikit:router config-ref="api-config" />
  </flow>\n${implementations}`;
}
function generateApiKitConfig(data) {
  return `  <apikit:config name="api-config" raml="api/${data.artifactId}.raml" outboundHeadersMapName="outboundHeaders" httpStatusVarName="httpStatusCode" />`;
}
module.exports = { generateApiKitFlow, generateApiKitConfig };