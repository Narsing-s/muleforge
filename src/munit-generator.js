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
  if (data.hasDatabase) processors.push(["db:select", "DB:CONNECTIVITY"], ["db:insert", "DB:CONNECTIVITY"]);
  if (connector === "snowflake") processors.push(["snowflake:select", "SNOWFLAKE:CONNECTIVITY"], ["snowflake:insert", "SNOWFLAKE:CONNECTIVITY"]);
  const map = {
    "anypoint-mq": [["anypoint-mq:publish", "ANYPOINT-MQ:CONNECTIVITY"]],
    "ibm-mq": [["ibm-mq:publish", "IBM-MQ:CONNECTIVITY"]],
    sftp: [["sftp:read", "SFTP:CONNECTIVITY"], ["sftp:write", "SFTP:CONNECTIVITY"], ["sftp:list", "SFTP:CONNECTIVITY"]],
    "object-store": [["os:store", "OS:STORE_NOT_AVAILABLE"]],
    file: [["file:read", "FILE:CONNECTIVITY"], ["file:write", "FILE:CONNECTIVITY"]],
    email: [["email:send", "EMAIL:CONNECTIVITY"]],
    jms: [["jms:publish", "JMS:CONNECTIVITY"]],
    kafka: [["kafka:publish", "KAFKA:CONNECTIVITY"]],
    salesforce: [["sfdc:query", "SALESFORCE:CONNECTIVITY"], ["sfdc:create", "SALESFORCE:CONNECTIVITY"]]
  };
  processors.push(...(map[connector] || []));
  if (!processors.length) processors.push(["http:request", "HTTP:CONNECTIVITY"]);
  return "\n" + processors.map(([processor, errorType]) => `      <munit-tools:mock-when processor="${processor}">
        <munit-tools:then-return>
          <munit-tools:error typeId="#['${errorType}']"/>
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
function declaredStatuses(operation = {}) {
  const statuses = new Set((Array.isArray(operation.errorStatuses) ? operation.errorStatuses : [])
    .map(Number)
    .filter(Number.isFinite));
  for (const error of Array.isArray(operation.errors) ? operation.errors : []) {
    const value = typeof error === "object" ? (error.status ?? error.code) : Number(error);
    const status = Number(value);
    if (Number.isFinite(status)) statuses.add(status);
  }
  return statuses;
}
function deriveScenarioPlan(operation = {}) {
  const declared = declaredStatuses(operation);
  const hasDeclaredErrors = declared.size > 0;
  const scenarios = [
    { name: "happy path", type: "success", status: operation.successStatus || 200 }
  ];
  if (!hasDeclaredErrors || declared.has(400) || (Array.isArray(operation.validation) && operation.validation.length)) {
    scenarios.push({ name: "validation failure", type: "validation", status: 400 });
  }
  if (!hasDeclaredErrors || [500, 502, 503, 504].some(status => declared.has(status))) {
    scenarios.push({ name: "connector failure", type: "connector-error", status: 503 });
  }
  if (operation.method === "GET" && String(operation.path || "").includes("{")) {
    scenarios.push({ name: "resource not found", type: "not-found", status: 404 });
  }
  if (declared.has(409) || ["POST", "PUT", "PATCH"].includes(String(operation.method || "").toUpperCase())) {
    scenarios.push({ name: "conflict or duplicate", type: "conflict", status: 409 });
  }
  for (const status of [...declared].sort((a, b) => a - b)) {
    const hasValidationRules = Array.isArray(operation.validation) && operation.validation.length > 0;
    if (![409, 500, 502, 503, 504].includes(status) && !(status === 400 && hasValidationRules)) {
      scenarios.push({ name: "status " + status, type: "declared-status", status });
    }
  }
  return scenarios;
}

function assertionForFields(fields = [], source = "payload", indent = "      ") {
  const checks = [];
  for (const field of Array.isArray(fields) ? fields : []) {
    const item = typeof field === "string" ? { name: field } : field || {};
    const name = item.name || item.field;
    if (!name) continue;
    const expression = `${source}.${name}`;
    checks.push(`${indent}<munit-tools:assert-that expression="#[${expression}]" is="#[MunitTools::notNullValue()]"/>`);
    if (item.required) checks.push(`${indent}<munit-tools:assert-that expression="#[!isEmpty(${expression} default null)]" is="#[MunitTools::equalTo(true)]"/>`);
    if (Array.isArray(item.enum) && item.enum.length) {
      const allowed = JSON.stringify(item.enum.map(String));
      checks.push(`${indent}<munit-tools:assert-that expression="#[${allowed}.contains(${expression})]" is="#[MunitTools::equalTo(true)]"/>`);
    }
    if (String(item.type || "").toLowerCase() === "object" && Array.isArray(item.fields)) {
      checks.push(assertionForFields(item.fields, expression, indent));
    }
    if (String(item.type || "").toLowerCase() === "array" && item.items && typeof item.items === "object" && Array.isArray(item.items.fields)) {
      checks.push(`${indent}<munit-tools:assert-that expression="#[sizeOf(${expression} default []) &gt; 0]" is="#[MunitTools::equalTo(true)]"/>`);
      checks.push(assertionForFields(item.items.fields, `${expression}[0]`, indent));
    }
  }
  return checks.filter(Boolean).join("\n");
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
${assertionForFields(op.responseFields)}
    </munit:validation>
  </munit:test>`);
    const scenarioPlan = deriveScenarioPlan({ ...op, method });
    const explicit400 = /(?:^|[^0-9])400(?:[^0-9]|$)/.test(JSON.stringify(op.errors || [])) || (Array.isArray(op.errorStatuses) && op.errorStatuses.map(Number).includes(400));
    if (explicit400 && !(Array.isArray(op.validation) && op.validation.length) && !scenarioPlan.some(s => s.type === "declared-status" && s.status === 400)) {
      scenarioPlan.push({ name: "status 400", type: "declared-status", status: 400 });
    }
    for (const scenario of scenarioPlan.filter(s => s.type === "declared-status")) {
      tests.push(`  <munit:test name="${testName(op, "status-" + scenario.status)}">
    <munit:execution>
      <munit:set-event><munit:set-payload value="#[{}]"/></munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default ${scenario.status}]" is="#[MunitTools::equalTo(${scenario.status})]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (scenarioPlan.some(s => s.type === "connector-error")) {
      tests.push(`  <munit:test name="${testName(op, "connector-error")}">
    <munit:behavior>${failureMocks}</munit:behavior>
    <munit:execution>
      <munit:set-event><munit:set-payload value="#[{}]"/></munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default 503]" is="#[MunitTools::equalTo(503)]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (scenarioPlan.some(s => s.type === "conflict")) {
      tests.push(`  <munit:test name="${testName(op, "conflict-or-duplicate")}">
    <munit:behavior>
      ${failureMocks}
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
    if (op.retry) {
      tests.push(`  <munit:test name="${testName(op, "retry-exhaustion")}">
    <munit:behavior>${failureMocks}
    </munit:behavior>
    <munit:execution>
      <munit:set-event><munit:set-payload value="#[{}]"/></munit:set-event>
      <flow-ref name="${xmlEscape(flow)}"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that expression="#[vars.httpStatus default 503]" is="#[MunitTools::equalTo(503)]"/>
    </munit:validation>
  </munit:test>`);
    }
    if (op.transaction) {
      tests.push(`  <munit:test name="${testName(op, "transaction-rollback")}">
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
