function xmlAttr(value){return String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function safeName(value){return String(value).replace(/[^A-Za-z0-9_]/g,"_");}
function normalizeChecks(options={}) {
  const checks = Array.isArray(options.dependencyChecks) ? options.dependencyChecks : [];
  return checks.map((check,index) => {
    if (typeof check === "string") return { name: "dependency_" + (index + 1), expression: check };
    if (!check || typeof check !== "object" || !check.check) return null;
    return { name: check.name || "dependency_" + (index + 1), expression: check.check };
  }).filter(Boolean);
}
function generateReadinessChecks(checks) {
  return checks.map(check => {
    const key = "health_" + safeName(check.name);
    const expression = xmlAttr(check.expression);
    return `    <try>
      <set-variable variableName="${key}" value="#[false]"/>
      <set-variable variableName="${key}" value="#[${expression}]"/>
      <error-handler>
        <on-error-continue type="ANY">
          <set-variable variableName="${key}" value="#[false]"/>
        </on-error-continue>
      </error-handler>
    </try>`;
  }).join("\n");
}
function generateHealthFlows(options={}){
  const deps=Array.isArray(options.dependencies)?options.dependencies:[];
  const checks=normalizeChecks(options);
  const legacyChecks=deps.map(d=>`      <set-variable variableName="health_${safeName(d)}" value="#[true]"/>`).join("\n");
  const readinessChecks=generateReadinessChecks(checks);
  const checkKeys=checks.map(c=>"health_"+safeName(c.name));
  const readinessPayload=checkKeys.length
    ? `{ status: if ((${checkKeys.map(k=>`vars.${k} == true`).join(" and ")})) "READY" else "NOT_READY", dependencies: {${checkKeys.map((k,i)=>`"${safeName(checks[i].name)}": vars.${k}`).join(", ")} } }`
    : `{ status: "READY" }`;
  return `  <flow name="health">
    <http:listener config-ref="HTTP_Listener_config" path="/health" allowedMethods="GET"/>
    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "UP" }]]></ee:set-payload></ee:message></ee:transform>
  </flow>
  <flow name="ready">
    <http:listener config-ref="HTTP_Listener_config" path="/ready" allowedMethods="GET"/>
${legacyChecks}
${readinessChecks}
    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
${readinessPayload}]]></ee:set-payload></ee:message></ee:transform>
  </flow>`;
}
module.exports={generateHealthFlows};