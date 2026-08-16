function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function safeName(value) {
  return String(value || "operation").replace(/[^A-Za-z0-9_-]/g, "-");
}

function dwValidation(validation = []) {
  const rules = validation.map(String).filter(Boolean).map(rule => {
    const email = /email/i.test(rule);
    const positive = /(greater|positive|>\s*0)/i.test(rule);
    if (email) return 'if (!isEmpty(payload.email) and (payload.email as String) matches /.+@.+\\..+/) payload else error({type: "VALIDATION", description: "Invalid email"})';
    if (positive) return 'if ((payload.amount default 0) > 0) payload else error({type: "VALIDATION", description: "Amount must be greater than zero"})';
    return null;
  }).filter(Boolean);
  if (!rules.length) return "payload";
  return rules.join("\n---\n");
}

function responseTransform(op) {
  const fields = op.responseFields && op.responseFields.length ? op.responseFields : ["status"];
  const pairs = fields.map(f => {
    const key = String(f).replace(/[^A-Za-z0-9_]/g, "");
    if (key === "status") return `status: "SUCCESS"`;
    return `${key}: payload.${key} default vars.${key} default null`;
  });
  return pairs.join(",\n    ");
}

function generateOperationFlow(op, data) {
  const name = `${data.artifactId}-${safeName(op.name)}-flow`;
  const endpoint = `${data.basePath}${op.path}`;
  const status = Number(op.successStatus || (op.method === "POST" ? 201 : 200));
  const validation = dwValidation(op.validation);
  return `  <flow name="${name}">
    <http:listener config-ref="HTTP_Listener_config" path="${xmlEscape(endpoint)}" allowedMethods="${xmlEscape(op.method)}" />
    <ee:transform doc:name="Validate and normalize request">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
${validation}]]></ee:set-payload>
      </ee:message>
    </ee:transform>
    <set-variable variableName="operationName" value="${xmlEscape(op.name)}" />
    <logger level="INFO" message="MuleForge processing #[vars.operationName]" />
    <ee:transform doc:name="Build response">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
    ${responseTransform(op)}
}]]></ee:set-payload>
      </ee:message>
    </ee:transform>
    <set-variable variableName="httpStatus" value="${status}" />
  </flow>
`;
}

function generateBusinessFlows(config, data) {
  return (config.operations || []).map(op => generateOperationFlow(op, data)).join("");
}

module.exports = { generateBusinessFlows };
