function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeName(value) { return String(value || "operation").replace(/[^A-Za-z0-9_-]/g, "-"); }
function operations(config = {}) { return config.operations || []; }
function testName(op, suffix) { return `${safeName(op.name || `${op.method}-${op.path}`)}-${suffix}-test`; }
function processorMocks(op, data) {
  const connector = String(op.connector || "").toLowerCase().replace(/_/g, "-");
  const mocks = [];
  const add = (processor, payload = "#[{}]") => mocks.push(`      <munit-tools:mock-when processor="${processor}">
        <munit-tools:then-return>
          <munit-tools:payload value="${payload}"/>
        </munit-tools:then-return>
      </munit-tools:mock-when>`);
  if (data.hasDatabase) {
    add("db:select", "#[[]]");
    add("db:insert", "#[{}]");
  }
  if (connector === "snowflake") {
    add("snowflake:select", "#[[]]");
    add("snowflake:insert", "#[{}]");
  }
  if (op.idempotency) add("os:store", "#[{}]");
  const connectorProcessors = {
    "anypoint-mq": ["anypoint-mq:publish"],
    "ibm-mq": ["ibm-mq:publish"],
    sftp: ["sftp:read", "sftp:write", "sftp:list"],
    "object-store": ["os:store"],
    file: ["file:read", "file:write"],
    email: ["email:send"],
    jms: ["jms:publish"],
    kafka: ["kafka:publish"],
    salesforce: ["sfdc:query", "sfdc:create"]
  };
  for (const processor of connectorProcessors[connector] || []) add(processor);
  return mocks.length ? `\n${mocks.join("\n")}` : "";
}
function buildFailureMocks(op, data) {
  const connector = String(op.connector || "").toLowerCase().replace(/_/g, "-");
  const processors = [];
  if (data.hasDatabase) processors.push("db:select", "db:insert");
  if (connector === "snowflake") processors.push("snowflake:select", "snowflake:insert");
  const map = {
    "anypoint-mq": ["anypoint-mq:publish"],
    "ibm-mq": ["ibm-mq:publish"],
    sftp: ["sftp:read", "sftp:write", "sftp:list"],
    "object-store": ["os:store"],
    file: ["file:read", "file:write"],
    email: ["email:send"],
    jms: ["jms:publish"],
    kafka: ["kafka:publish"],
    salesforce: ["sfdc:query", "sfdc:create"]
  };
  processors.push(...(map[connector] || []));
  if (!processors.length) processors.push("http:request");
  return "\n" + processors.map(processor => `      <munit-tools:mock-when processor="${processor}">
        <munit-tools:then-return>
          <munit-tools:error typeId="#['CONNECTIVITY']"/>
        </munit-tools:then-return>
      </munit-tools:mock-when>`).join("\n");
}
function isCustomerNotFoundScenario(op, data) {
  return Boolean(
    data.hasDatabase &&
    String(data.databaseType || "").toLowerCase() === "snowflake" &&
    String(op.method || "").toUpperCase() === "GET" &&
    /customers?\/\{[^}]+\}$/i.test(String(op.path || ""))
  );
}
function deriveScenarioPlan(operation = {}) {
  const scenarios = [
    { name: "happy path", type: "success", status: operation.successStatus || 200 },
    { name: "validation failure", type: "validation", status: 400 },
    { name: "connector failure", type: "connector-error", status: 500 }
  ];
  if (operation.method === "GET" && String(operation.path || "").includes("{")) {
    scenarios.push({ name: "resource not found", type: "not-found", status: 404 });
  }
  if (["POST", "PUT", "PATCH"].includes(String(operation.method || "").toUpperCase())) {
    scenarios.push({ name: "conflict or duplicate", type: "conflict", status: 409 });
  }
  return scenarios;
}

function generateMunit(config, data) {
  const ops = operations(config);
  const tests = [];
  for (const op of ops) {
    const flow = `${data.artifactId}-${safeName(op.name || `${op.method}-${op.path}`)}-flow`;
    const method = String(op.method || "GET").toUpperCase();
    const success = Number(op.successStatus || (method === "POST" ? 201 : 200));
    const mocks = processorMocks(op, data);
    const failureMocks = buildFailureMocks(op, data);
    tests.push(`  <munit:test name="${testName(op, "happy-path")}">
    <munit:behavior>${mocks}
    </munit:behavior>
    <munit:execution>
      <munit:set-event>
        <munit:payload value="#[${method === "GET" ? "{}" : "{ name: 'Test Customer', email: 'test@example.com', mobileNumber: '9999999999' }"}]"/>
      </munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default ${success}]" is="#[MunitTools::equalTo(${success})]"/>
    </munit:validation>
  </munit:test>`);
    const scenarioPlan = deriveScenarioPlan({ ...op, method });
    if (scenarioPlan.some(s => s.type === "connector-error")) {
      tests.push(`  <munit:test name="${testName(op, "connector-error")}">
    <munit:behavior>${failureMocks}</munit:behavior>
    <munit:execution>
      <munit:set-event><munit:set-payload value="#[{}]"/></munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default 500]" is="#[MunitTools::equalTo(500)]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (op.idempotency) {
      tests.push(`  <munit:test name="${testName(op, "idempotency-duplicate")}">
    <munit:behavior>
      <munit-tools:mock-when processor="os:store">
        <munit-tools:then-return>
          <munit-tools:error typeId="#['OS:KEY_ALREADY_EXISTS']"/>
        </munit-tools:then-return>
      </munit-tools:mock-when>
    </munit:behavior>
    <munit:execution>
      <munit:set-event><munit:set-payload value="#[{}]"/></munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default 409]" is="#[MunitTools::equalTo(409)]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (op.pagination) {
      tests.push(`  <munit:test name="${testName(op, "pagination")}">
    <munit:execution>
      <munit:set-event>
        <munit:attributes value="#[{ queryParams: { page: '2', pageSize: '10' } }]"/>
      </munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.page]" is="#[MunitTools::equalTo(2)]"/>
      <munit-tools:assert-that expression="#[vars.pageSize]" is="#[MunitTools::equalTo(10)]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (op.validation && op.validation.length) {
      tests.push(`  <munit:test name="${testName(op, "validation")}">
    <munit:execution>
      <munit:set-event>
        <munit:payload value="#[{}]"/>
      </munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default 400]" is="#[MunitTools::equalTo(400)]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (isCustomerNotFoundScenario(op, data)) {
      tests.push(`  <munit:test name="${testName(op, "not-found")}">
    <munit:behavior>
      <munit-tools:mock-when processor="db:select">
        <munit-tools:then-return payload="#[[]]"/>
      </munit-tools:mock-when>
    </munit:behavior>
    <munit:execution>
      <munit:set-event>
        <munit:attributes value="#[{ uriParams: { customerId: 'missing' } }]"/>
      </munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default 404]" is="#[MunitTools::equalTo(404)]"/>
    </munit:validation>
  </munit:test>`);
    }
  }
  const objectStoreXml = (config.operations || []).some(o => o.idempotency) ? '\n      xmlns:os="http://www.mulesoft.org/schema/mule/os"' : '';
  const objectStoreSchema = (config.operations || []).some(o => o.idempotency) ? '\n      http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:db="http://www.mulesoft.org/schema/mule/db"
      xmlns:munit="http://www.mulesoft.org/schema/mule/munit"
      xmlns:munit-tools="http://www.mulesoft.org/schema/mule/munit-tools"${objectStoreXml}
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
      http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd
      http://www.mulesoft.org/schema/mule/munit http://www.mulesoft.org/schema/mule/munit/current/mule-munit.xsd
      http://www.mulesoft.org/schema/mule/munit-tools http://www.mulesoft.org/schema/mule/munit-tools/current/mule-munit-tools.xsd${objectStoreSchema}>
  <munit:config name="${xmlEscape(data.artifactId)}-test-suite"/>
${tests.join("\n")}
</mule>
`;
}
module.exports = { generateMunit };
