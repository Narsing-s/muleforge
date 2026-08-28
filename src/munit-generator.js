function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
function safeName(value) { return String(value || "operation").replace(/[^A-Za-z0-9_-]/g, "-"); }
function operations(config = {}) { return config.operations || []; }
function testName(op, suffix) { return `${safeName(op.name || `${op.method}-${op.path}`)}-${suffix}-test`; }
function generateMunit(config, data) {
  const ops = operations(config);
  const tests = [];
  for (const op of ops) {
    const flow = `${data.artifactId}-${safeName(op.name || `${op.method}-${op.path}`)}-flow`;
    const method = String(op.method || "GET").toUpperCase();
    const success = Number(op.successStatus || (method === "POST" ? 201 : 200));
    const needsDb = Boolean(data.hasDatabase);
    const mockDb = needsDb ? `\n      <munit-tools:mock-when processor="db:select">\n        <munit-tools:then-return payload="#[[]]"/>\n      </munit-tools:mock-when>\n      <munit-tools:mock-when processor="db:insert">\n        <munit-tools:then-return payload="#[{}]"/>\n      </munit-tools:mock-when>` : "";
    tests.push(`  <munit:test name="${testName(op, "happy-path")}">\n    <munit:behavior>${mockDb}\n    </munit:behavior>\n    <munit:execution>\n      <munit:set-event>\n        <munit:payload value="#[${method === "GET" ? "{}" : "{ name: 'Test Customer', email: 'test@example.com', mobileNumber: '9999999999' }"}]"/>\n      </munit:set-event>\n      <flow-ref name="${xmlEscape(flow)}"/>\n    </munit:execution>\n    <munit:validation>\n      <munit-tools:assert-that expression="#[vars.httpStatus default ${success}]" is="equalTo(${success})"/>\n    </munit:validation>\n  </munit:test>`);
    if (op.validation && op.validation.length) {
      tests.push(`  <munit:test name="${testName(op, "validation")}">\n    <munit:execution>\n      <munit:set-event>\n        <munit:payload value="#[{}]"/>\n      </munit:set-event>\n      <flow-ref name="${xmlEscape(flow)}"/>\n    </munit:execution>\n    <munit:validation>\n      <munit-tools:assert-that expression="#[vars.httpStatus default 400]" is="equalTo(400)"/>\n    </munit:validation>\n  </munit:test>`);
    }
    if (method === "GET") {
      const notFoundMock = needsDb ? `\n      <munit-tools:mock-when processor="db:select">\n        <munit-tools:then-return payload="#[[]]"/>\n      </munit-tools:mock-when>` : "";
      tests.push(`  <munit:test name="${testName(op, "not-found")}">\n    <munit:behavior>${notFoundMock}\n    </munit:behavior>\n    <munit:execution>\n      <munit:set-event>\n        <munit:attributes value="#[{ uriParams: { customerId: 'missing' } }]"/>\n      </munit:set-event>\n      <flow-ref name="${xmlEscape(flow)}"/>\n    </munit:execution>\n    <munit:validation>\n      <munit-tools:assert-that expression="#[vars.httpStatus default 404]" is="equalTo(404)"/>\n    </munit:validation>\n  </munit:test>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mule xmlns="http://www.mulesoft.org/schema/mule/core"\n      xmlns:db="http://www.mulesoft.org/schema/mule/db"\n      xmlns:munit="http://www.mulesoft.org/schema/mule/munit"\n      xmlns:munit-tools="http://www.mulesoft.org/schema/mule/munit-tools"\n      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd\n      http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd\n      http://www.mulesoft.org/schema/mule/munit http://www.mulesoft.org/schema/mule/munit/current/mule-munit.xsd\n      http://www.mulesoft.org/schema/mule/munit-tools http://www.mulesoft.org/schema/mule/munit-tools/current/mule-munit-tools.xsd">\n  <munit:config name="${xmlEscape(data.artifactId)}-test-suite"/>\n${tests.join("\n")}\n</mule>\n`;
}
module.exports = { generateMunit };
