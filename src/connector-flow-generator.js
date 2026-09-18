function generatedErrorHandler() { return '<error-handler>\n      <on-error-continue type="CONNECTIVITY" logException="true"><set-variable variableName="httpStatus" value="503"/></on-error-continue>\n      <on-error-continue type="TIMEOUT" logException="true"><set-variable variableName="httpStatus" value="504"/></on-error-continue>\n      <on-error-continue type="ANY" logException="true"><set-variable variableName="httpStatus" value="500"/></on-error-continue>\n    </error-handler>'; }\n\nfunction esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safe(value) { return String(value || 'operation').replace(/[^A-Za-z0-9_-]/g, '-'); }

function source(op, data, endpoint, method, status) {
  if (op.schedule) {
    const cron = String(op.schedule).match(/cron(?: expression)?\s*[:=]\s*(.+)/i);
    if (cron) return `    <scheduler doc:name="Documented schedule"><scheduling-strategy><cron expression="${esc(cron[1].trim())}"/></scheduling-strategy></scheduler>\n`;
    const m = String(op.schedule).match(/(\d+)\s*(seconds?|minutes?|hours?|days?)/i);
    if (m) {
      const unit = m[2].toUpperCase().replace(/S$/, "");
      return `    <scheduler doc:name="Documented schedule"><scheduling-strategy><fixed-frequency frequency="${m[1]}" timeUnit="${unit}"/></scheduling-strategy></scheduler>\n`;
    }
  }
  return `    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]"/></http:listener>\n`;
}

function params(fields = []) {
  return fields.map(field => `${field}: payload.${field} default null`).join(', ');
}

function connectorFlow(op, data) {
  const connector = String(op.connector || '').toLowerCase().replace(/_/g, '-');
  if (!connector) return null;
  const name = `${data.artifactId}-${safe(op.name)}-flow`;
  const endpoint = `${data.basePath}${op.path}`;
  const method = String(op.method || 'GET').toUpperCase();
  const action = String(op.action || op.connectorAction || '').toLowerCase();
  const status = Number(op.successStatus || (method === 'POST' ? 201 : 200));

  if (connector === 'http' && op.downstreamEndpoint) {
    const url = esc(op.downstreamEndpoint);
    return `  <flow name="${name}">
    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}">
      <http:response statusCode="#[vars.httpStatus default ${status}]" />
    </http:listener>
    <http:request method="${method}" url="${url}" doc:name="Call documented downstream API">
      <http:headers><![CDATA[#[{}]]]></http:headers>
    </http:request>
    <set-variable variableName="httpStatus" value="${status}" />
    ${generatedErrorHandler()}
  </flow>
`;
  }

  if (connector === 'database' || connector === 'snowflake') {
    const table = esc(op.table || data.databaseTable || 'CUSTOMER');
    const fields = op.fields || op.requestFields || [];
    if (action === 'insert' || method === 'POST') {
      const names = fields.length ? fields : ['name', 'email'];
      const cols = names.map(x => esc(x.toUpperCase())).join(', ');
      const binds = names.map(x => `:${x}`).join(', ');
      return `  <flow name="${name}">\n${source(op, data, endpoint, method, status)}\n    <db:insert config-ref="Database_Config" doc:name="Insert ${esc(table)}">\n      <db:sql><![CDATA[INSERT INTO ${table} (${cols}) VALUES (${binds})]]></db:sql>\n      <db:input-parameters><![CDATA[#[{ ${params(names)} }]]]></db:input-parameters>\n    </db:insert>\n    <set-variable variableName="httpStatus" value="${status}" />\n    <ee:transform doc:name="Response"><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n{ status: "SUCCESS", data: payload }]]></ee:set-payload></ee:message></ee:transform>\n  </flow>\n`;
    }
    const where = op.where || `${fields[0] || 'ID'} = :${fields[0] || 'id'}`;
    return `  <flow name="${name}">\n${source(op, data, endpoint, method, status)}\n    <db:select config-ref="Database_Config" doc:name="Select ${esc(table)}">\n      <db:sql><![CDATA[SELECT * FROM ${table} WHERE ${esc(where)}]]></db:sql>\n      <db:input-parameters><![CDATA[#[${JSON.stringify(op.parameters || {})}]]]></db:input-parameters>\n    </db:select>\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'sftp') {
    const filePath = esc(op.filePath || '${sftp.filePath}');
    return `  <flow name="${name}">\n${source(op, data, endpoint, method, status)}\n    <sftp:read config-ref="SFTP_Config" path="${filePath}" doc:name="Read SFTP file" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'anypoint-mq') {
    const destination = esc(op.destination || '${anypointmq.destination}');
    return `  <flow name="${name}">\n${source(op, data, endpoint, method, status)}\n    <anypoint-mq:publish config-ref="Anypoint_MQ_Config" destination="${destination}" doc:name="Publish message" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'ibm-mq') {
    return `  <flow name="${name}">\n${source(op, data, endpoint, method, status)}\n    <ibm-mq:publish config-ref="IBM_MQ_Config" destination="${esc(op.destination || '${ibmmq.queue}')}" doc:name="Publish message" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  if (connector === 'object-store') {
    return `  <flow name="${name}">\n${source(op, data, endpoint, method, status)}\n    <os:store key="#[attributes.queryParams.key default 'default']" value="#[payload]" doc:name="Store value" />\n    <set-variable variableName="httpStatus" value="${status}" />\n  </flow>\n`;
  }

  return null;
}

module.exports = { connectorFlow };
