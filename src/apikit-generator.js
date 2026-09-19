function generateApiKitFlow(data) {
  const base = String(data.basePath || "/api/v1").replace(/"/g, "&quot;");
  return `  <flow name="${data.artifactId}-apikit-main">
    <http:listener config-ref="HTTP_Listener_config" path="${base}/*" allowedMethods="GET,POST,PUT,PATCH,DELETE,OPTIONS">
      <http:response statusCode="#[vars.httpStatusCode default 200]" />
    </http:listener>
    <apikit:router config-ref="api-config" />
  </flow>`;
}
function generateApiKitConfig(data) {
  return `  <apikit:config name="api-config" raml="${data.artifactId}.raml" outboundHeadersMapName="outboundHeaders" httpStatusVarName="httpStatusCode" />`;
}
module.exports = { generateApiKitFlow, generateApiKitConfig };