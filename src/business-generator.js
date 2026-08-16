function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function safeName(value) {
  return String(value || "operation").replace(/[^A-Za-z0-9_-]/g, "-");
}

function dwValidation(validation = []) {
  const rules = validation.map(String).filter(Boolean).map(rule => {
    if (/email/i.test(rule)) return 'if (!isEmpty(payload.email) and (payload.email as String) matches /.+@.+\\..+/) payload else error({type: "VALIDATION", description: "Invalid email"})';
    if (/(greater|positive|>\s*0)/i.test(rule)) return 'if ((payload.amount default 0) > 0) payload else error({type: "VALIDATION", description: "Amount must be greater than zero"})';
    return null;
  }).filter(Boolean);
  return rules.length ? rules.join("\n---\n") : "payload";
}

function responseTransform(op) {
  const fields = op.responseFields && op.responseFields.length ? op.responseFields : ["status"];
  return fields.map(f => {
    const key = String(f).replace(/[^A-Za-z0-9_]/g, "");
    if (key === "status") return `status: "SUCCESS"`;
    return `${key}: payload.${key} default vars.${key} default null`;
  }).join(",\n    ");
}

function databaseType(data) {
  return data && data.hasDatabase ? String(data.databaseType || "").toLowerCase() : "";
}

function isCreateCustomer(op) {
  return String(op.method).toUpperCase() === "POST" && /customers?$/i.test(String(op.path));
}

function isGetCustomer(op) {
  return String(op.method).toUpperCase() === "GET" && /customers?\/\{[^}]+\}$/i.test(String(op.path));
}

function customerInsertFlow(op, data) {
  const table = xmlEscape(data.databaseTable || "CUSTOMER");
  return `
    <db:select config-ref="Database_Config" doc:name="Check duplicate customer">
      <db:sql><![CDATA[SELECT CUSTOMER_ID FROM ${table} WHERE EMAIL = :email LIMIT 1]]></db:sql>
      <db:input-parameters><![CDATA[#[{ email: payload.email }]]]></db:input-parameters>
    </db:select>
    <choice doc:name="Customer exists?">
      <when expression="#[sizeOf(payload) &gt; 0]">
        <set-variable variableName="httpStatus" value="409" />
        <ee:transform doc:name="Duplicate response">
          <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "FAILED", code: "CUSTOMER_EXISTS", message: "Customer already exists" }]]></ee:set-payload></ee:message>
        </ee:transform>
      </when>
      <otherwise>
        <set-variable variableName="customerId" value="#[uuid()]" />
        <db:insert config-ref="Database_Config" doc:name="Insert customer">
          <db:sql><![CDATA[INSERT INTO ${table} (CUSTOMER_ID, NAME, EMAIL, MOBILE_NUMBER) VALUES (:customerId, :name, :email, :mobileNumber)]]></db:sql>
          <db:input-parameters><![CDATA[#[{
            customerId: vars.customerId,
            name: payload.name,
            email: payload.email,
            mobileNumber: payload.mobileNumber
          }]]]></db:input-parameters>
        </db:insert>
        <set-variable variableName="httpStatus" value="201" />
        <ee:transform doc:name="Created response">
          <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ customerId: vars.customerId, status: "SUCCESS" }]]></ee:set-payload></ee:message>
        </ee:transform>
      </otherwise>
    </choice>`;
}

function customerGetFlow(op, data) {
  const table = xmlEscape(data.databaseTable || "CUSTOMER");
  const parameter = String(op.path).match(/\{([^}]+)\}/)?.[1] || "customerId";
  return `
    <db:select config-ref="Database_Config" doc:name="Find customer">
      <db:sql><![CDATA[SELECT CUSTOMER_ID, NAME, EMAIL, MOBILE_NUMBER FROM ${table} WHERE CUSTOMER_ID = :customerId LIMIT 1]]></db:sql>
      <db:input-parameters><![CDATA[#[{ customerId: attributes.uriParams.${parameter} }]]]></db:input-parameters>
    </db:select>
    <choice doc:name="Customer found?">
      <when expression="#[sizeOf(payload) == 0]">
        <set-variable variableName="httpStatus" value="404" />
        <ee:transform doc:name="Not found response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "FAILED", code: "CUSTOMER_NOT_FOUND", message: "Customer not found" }]]></ee:set-payload></ee:message></ee:transform>
      </when>
      <otherwise>
        <set-variable variableName="httpStatus" value="200" />
        <ee:transform doc:name="Customer response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ customerId: payload[0].CUSTOMER_ID, name: payload[0].NAME, email: payload[0].EMAIL, mobileNumber: payload[0].MOBILE_NUMBER, status: "SUCCESS" }]]></ee:set-payload></ee:message></ee:transform>
      </otherwise>
    </choice>`;
}

function genericFlow(op, data) {
  const name = `${data.artifactId}-${safeName(op.name)}-flow`;
  const endpoint = `${data.basePath}${op.path}`;
  const status = Number(op.successStatus || (op.method === "POST" ? 201 : 200));
  const validation = dwValidation(op.validation);
  return `  <flow name="${name}">
    <http:listener config-ref="HTTP_Listener_config" path="${xmlEscape(endpoint)}" allowedMethods="${xmlEscape(op.method)}">
      <http:response statusCode="#[vars.httpStatus default ${status}]" />
    </http:listener>
    <ee:transform doc:name="Validate and normalize request"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
${validation}]]></ee:set-payload></ee:message></ee:transform>
    <set-variable variableName="operationName" value="${xmlEscape(op.name)}" />
    <logger level="INFO" message="MuleForge processing #[vars.operationName]" />
    <ee:transform doc:name="Build response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ ${responseTransform(op)} }]]></ee:set-payload></ee:message></ee:transform>
    <set-variable variableName="httpStatus" value="${status}" />
  </flow>\n`;
}

function generateOperationFlow(op, data) {
  const name = `${data.artifactId}-${safeName(op.name)}-flow`;
  const endpoint = `${data.basePath}${op.path}`;
  if (data.hasDatabase && databaseType(data) === "snowflake" && isCreateCustomer(op)) {
    return `  <flow name="${name}">
    <http:listener config-ref="HTTP_Listener_config" path="${xmlEscape(endpoint)}" allowedMethods="POST">
      <http:response statusCode="#[vars.httpStatus default 201]" />
    </http:listener>
    <ee:transform doc:name="Validate customer request"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
if (isEmpty(payload.name default "") or isEmpty(payload.email default "") or isEmpty(payload.mobileNumber default "")) error({type: "VALIDATION", description: "name, email and mobileNumber are required"})
else if (!((payload.email as String) matches /.+@.+\\..+/)) error({type: "VALIDATION", description: "Invalid email"})
else payload]]></ee:set-payload></ee:message></ee:transform>
    <try doc:name="Create customer">
      ${customerInsertFlow(op, data)}
      <error-handler>
        <on-error-continue type="ANY" logException="true">
          <set-variable variableName="httpStatus" value="500" />
          <ee:transform doc:name="System error response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "FAILED", code: "CUSTOMER_CREATE_FAILED", message: "Customer could not be created" }]]></ee:set-payload></ee:message></ee:transform>
        </on-error-continue>
      </error-handler>
    </try>
  </flow>\n`;
  }
  if (data.hasDatabase && databaseType(data) === "snowflake" && isGetCustomer(op)) {
    return `  <flow name="${name}">
    <http:listener config-ref="HTTP_Listener_config" path="${xmlEscape(endpoint)}" allowedMethods="GET">
      <http:response statusCode="#[vars.httpStatus default 200]" />
    </http:listener>
    <try doc:name="Get customer">
      ${customerGetFlow(op, data)}
      <error-handler>
        <on-error-continue type="ANY" logException="true">
          <set-variable variableName="httpStatus" value="500" />
          <ee:transform doc:name="System error response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "FAILED", code: "CUSTOMER_READ_FAILED", message: "Customer could not be retrieved" }]]></ee:set-payload></ee:message></ee:transform>
        </on-error-continue>
      </error-handler>
    </try>
  </flow>\n`;
  }
  return genericFlow(op, data);
}

function generateBusinessFlows(config, data) {
  return (config.operations || []).map(op => generateOperationFlow(op, data)).join("");
}

module.exports = { generateBusinessFlows };
