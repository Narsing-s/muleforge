function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safe(value) { return String(value || 'operation').replace(/[^A-Za-z0-9_-]/g, '-'); }

function params(fields = []) {
  return fields.map(field => `${field}: payload.${field} default null`).join(', ');
}

function connectorFlow(op, data) {
  const connector = String(op.connector || '').toLowerCase().replace(/_/g, '-');
  if (!connector || connector === 'http') return null;
  const name = `${data.artifactId}-${safe(op.name)}-flow`;
  const endpoint = `${data.basePath}${op.path}`;
  const method = String(op.method || 'GET').toUpperCase();
  const action = String(op.action || op.connectorAction || '').toLowerCase();
  const status = Number(op.successStatus || (method === 'POST' ? 201 : 200));

  if (connector === 'database' || connector === 'snowflake') {
    const table = esc(op.table || data.databaseTable || 'CUSTOMER');
    const fields = op.fields || op.requestFields || [];
    if (action === 'insert' || method === 'POST') {
      const names = fields.length ? fields : ['name', 'email'];
      const cols = names.map(x => esc(x.toUpperCase())).join(', ');
      const binds = names.map(x => `:${x}`).join(', ');
      return `  <flow name="${name}">\n    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]" /></http:listener>\n    <db:insert config-ref="Database_Config" doc:name="Insert ${esc(table)}">\n      <db:sql><![CDATA[INSERT INTO ${table} (${cols}) VALUES (${binds})]]></db:sql>\n      <db:input-parameters><![CDATA[#[{ ${params(names)} }]]]></db:input-parameters>\n    </db:insert>\n    <set-variable variableName="httpStatus" value="${status}" />\n    <ee:transform doc:name="Response"><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n{ status: "SUCCESS", data: payload }]]></ee:set-payload></ee:message></ee:transform>\n  </flow>\n`;
    }
    const where = op.where || `${fields[0] || 'ID'} = :${fields[0] || 'id'}`;
    return `  <flow name="${name}">\n    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]" /></http:listener>\n    <db:select config-ref="Database_Config" doc:name="Select ${esc(table)}">\n      <db:sql><![CDATA[SELECT * FROM ${table} WHERE ${esc(where)}]]></db:sql>\n      <db:input-parameters><![CDATA[#[${JSON.stringify(op.parameters || {})}]]]></db:input-parameters>\n    </db:select>\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'sftp') {
    const filePath = esc(op.filePath || '${sftp.filePath}');
    return `  <flow name="${name}">\n    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]" /></http:listener>\n    <sftp:read config-ref="SFTP_Config" path="${filePath}" doc:name="Read SFTP file" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'anypoint-mq') {
    const destination = esc(op.destination || '${anypointmq.destination}');
    return `  <flow name="${name}">\n    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]" /></http:listener>\n    <anypoint-mq:publish config-ref="Anypoint_MQ_Config" destination="${destination}" doc:name="Publish message" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'ibm-mq') {
    return `  <flow name="${name}">\n    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]" /></http:listener>\n    <ibm-mq:publish config-ref="IBM_MQ_Config" destination="${esc(op.destination || '${ibmmq.queue}')}" doc:name="Publish message" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'object-store') {
    return `  <flow name="${name}">\n    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]" /></http:listener>\n    <os:store key="#[attributes.queryParams.key default 'default']" value="#[payload]" doc:name="Store value" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  return null;
}

module.exports = { connectorFlow };
