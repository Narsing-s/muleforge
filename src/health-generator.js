function generateHealthFlows(options={}){const deps=Array.isArray(options.dependencies)?options.dependencies:[];const checks=deps.map(d=>`      <set-variable variableName="health_${String(d).replace(/[^A-Za-z0-9_]/g,"_")}" value="#[true]"/>`).join("\n");return `  <flow name="health">
    <http:listener config-ref="HTTP_Listener_config" path="/health" allowedMethods="GET"/>
    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "UP" }]]></ee:set-payload></ee:message></ee:transform>
  </flow>
  <flow name="ready">
    <http:listener config-ref="HTTP_Listener_config" path="/ready" allowedMethods="GET"/>
${checks}
    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "READY" }]]></ee:set-payload></ee:message></ee:transform>
  </flow>`;}
module.exports={generateHealthFlows};