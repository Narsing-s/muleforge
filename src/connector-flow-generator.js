function generatedErrorHandler() {
  return `    <error-handler>
      <on-error-propagate type="CONNECTIVITY" logException="true">
        <set-variable variableName="httpStatus" value="503"/>
        <set-payload value="#[{ status: 'FAILED', code: 'DEPENDENCY_ERROR', message: error.description default 'Dependency unavailable' }]" mimeType="application/json"/>
      </on-error-propagate>
      <on-error-propagate type="TIMEOUT" logException="true">
        <set-variable variableName="httpStatus" value="504"/>
        <set-payload value="#[{ status: 'FAILED', code: 'TIMEOUT', message: error.description default 'Dependency timed out' }]" mimeType="application/json"/>
      </on-error-propagate>
      <on-error-propagate type="RETRY_EXHAUSTED" logException="true">
        <set-variable variableName="httpStatus" value="503"/>
        <set-payload value="#[{ status: 'FAILED', code: 'RETRY_EXHAUSTED', message: error.description default 'Operation could not be completed' }]" mimeType="application/json"/>
      </on-error-propagate>
      <on-error-propagate type="ANY" logException="true">
        <set-variable variableName="httpStatus" value="500"/>
        <set-payload value="#[{ status: 'FAILED', code: 'INTERNAL_ERROR', message: error.description default 'Internal server error' }]" mimeType="application/json"/>
      </on-error-propagate>
    </error-handler>`;
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safe(value) {
  return String(value || 'operation').replace(/[^A-Za-z0-9_-]/g, '-');
}

function source(op, data, endpoint, method, status) {
  if (op.schedule) {
    const cron = String(op.schedule).match(/cron(?: expression)?\s*[:=]\s*(.+)/i);
    if (cron) return `    <scheduler doc:name="Documented schedule"><scheduling-strategy><cron expression="${esc(cron[1].trim())}"/></scheduling-strategy></scheduler>\n`;
    const match = String(op.schedule).match(/(\d+)\s*(seconds?|minutes?|hours?|days?)/i);
    if (match) {
      const unit = match[2].toUpperCase().replace(/S$/, '');
      return `    <scheduler doc:name="Documented schedule"><scheduling-strategy><fixed-frequency frequency="${match[1]}" timeUnit="${unit}"/></scheduling-strategy></scheduler>\n`;
    }
  }
  return `    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}"><http:response statusCode="#[vars.httpStatus default ${status}]"/></http:listener>\n`;
}

function params(fields = []) {
  return fields.map(field => `${field}: payload.${field} default null`).join(', ');
}

function withErrorHandler(body) {
  return `${body}\n${generatedErrorHandler()}\n  </flow>\n`;
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
    return withErrorHandler(`  <flow name="${name}">
    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}">
      <http:response statusCode="#[vars.httpStatus default ${status}]" />
    </http:listener>
    <http:request method="${method}" url="${url}" doc:name="Call documented downstream API">
      <http:headers><![CDATA[#[{}]]]></http:headers>
    </http:request>
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'database' || connector === 'snowflake') {
    const table = esc(op.table || data.databaseTable || 'CUSTOMER');
    const fields = op.fields || op.requestFields || [];
    if (action === 'insert' || method === 'POST') {
      const names = fields.length ? fields : ['name', 'email'];
      const cols = names.map(x => esc(x.toUpperCase())).join(', ');
      const binds = names.map(x => `:${x}`).join(', ');
      return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <db:insert config-ref="Database_Config" doc:name="Insert ${esc(table)}">
      <db:sql><![CDATA[INSERT INTO ${table} (${cols}) VALUES (${binds})]]></db:sql>
      <db:input-parameters><![CDATA[#[{ ${params(names)} }]]]></db:input-parameters>
    </db:insert>
    <set-variable variableName="httpStatus" value="${status}" />
    <ee:transform doc:name="Response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "SUCCESS", data: payload }]]></ee:set-payload></ee:message></ee:transform>`);
    }
    const where = op.where || `${fields[0] || 'ID'} = :${fields[0] || 'id'}`;
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <db:select config-ref="Database_Config" doc:name="Select ${esc(table)}">
      <db:sql><![CDATA[SELECT * FROM ${table} WHERE ${esc(where)}]]></db:sql>
      <db:input-parameters><![CDATA[#[${JSON.stringify(op.parameters || {})}]]]></db:input-parameters>
    </db:select>
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'sftp') {
    const filePath = esc(op.filePath || '${sftp.filePath}');
    const downstream = op.downstreamEndpoint
      ? `\n    <http:request method="POST" url="${esc(op.downstreamEndpoint)}" doc:name="Send to documented downstream API" />`
      : '';
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <sftp:read config-ref="SFTP_Config" path="${filePath}" doc:name="Read SFTP file" />${downstream}
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'anypoint-mq') {
    const destination = esc(op.destination || '${anypointmq.destination}');
    const downstream = op.downstreamEndpoint
      ? `\n    <http:request method="POST" url="${esc(op.downstreamEndpoint)}" doc:name="Call documented downstream API" />`
      : '';
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <anypoint-mq:publish config-ref="Anypoint_MQ_Config" destination="${destination}" doc:name="Publish message" />${downstream}
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'ibm-mq') {
    const destination = esc(op.destination || '${ibmmq.queue}');
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <ibm-mq:publish config-ref="IBM_MQ_Config" destination="${destination}" doc:name="Publish message" />
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'object-store') {
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <os:store key="#[attributes.queryParams.key default 'default']" value="#[payload]" doc:name="Store value" />
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  return null;
}

module.exports = { connectorFlow };
