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
  const policy = [];
  policy.push(`    <set-variable variableName="correlationId" value="#[attributes.headers.'x-correlation-id' default uuid()]" />`);
  if (op.idempotency) policy.push(`    <set-variable variableName="idempotencyKey" value="#[attributes.headers.'Idempotency-Key' default null]" />
    <choice doc:name="Validate Idempotency-Key">
      <when expression="#[isEmpty(vars.idempotencyKey default '')]">
        <set-variable variableName="httpStatus" value="400" />
        <raise-error type="VALIDATION:VALIDATION" description="Idempotency-Key header is required" />
      </when>
    </choice>`);
  if (op.pagination) policy.push(`    <set-variable variableName="page" value="#[(attributes.queryParams.page default 1) as Number]" />
    <set-variable variableName="pageSize" value="#[(attributes.queryParams.pageSize default ${Number(op.pagination.defaultPageSize || 20)}) as Number]" />`);
  if (op.transaction) policy.push(`    <logger level="INFO" message="Transactional policy requested; review transaction boundary before production use" />`);
  return `    <http:listener config-ref="HTTP_Listener_config" path="${esc(endpoint)}" allowedMethods="${method}">
      <http:response statusCode="#[vars.httpStatus default ${status}]">
        <http:headers><![CDATA[#[{ 'x-correlation-id': vars.correlationId default uuid() }]]]></http:headers>
      </http:response>
      <http:error-response statusCode="#[vars.httpStatus default 500]">
        <http:body><![CDATA[#[payload]]]></http:body>
      </http:error-response>
    </http:listener>
${policy.join("\n")}\n`;
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
      <http:error-response statusCode="#[vars.httpStatus default 500]">
        <http:body><![CDATA[#[payload]]]></http:body>
      </http:error-response>
    </http:listener>
    <http:request method="${method}" url="${url}" doc:name="Call documented downstream API">
      <http:headers><![CDATA[#[{}]]]></http:headers>
    </http:request>
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'snowflake') {
    const table = esc(op.table || data.databaseTable || 'CUSTOMER');
    const fields = op.fields || op.requestFields || [];
    if (action === 'insert' || method === 'POST') {
      const names = fields.length ? fields : ['name', 'email'];
      const cols = names.map(x => esc(x.toUpperCase())).join(', ');
      const values = names.map(x => ':' + x).join(', ');
      return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <snowflake:insert config-ref="Snowflake_Config" doc:name="Insert ${esc(table)}">
      <snowflake:sql><![CDATA[INSERT INTO ${table} (${cols}) VALUES (${values})]]></snowflake:sql>
      <snowflake:input-parameters><![CDATA[#[{ ${params(names)} }]]]></snowflake:input-parameters>
    </snowflake:insert>
    <set-variable variableName="httpStatus" value="${status}" />
    <ee:transform doc:name="Response"><ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ status: "SUCCESS", data: payload }]]></ee:set-payload></ee:message></ee:transform>`);
    }
    const where = op.where || (fields[0] || 'ID') + ' = :' + (fields[0] || 'id');
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <snowflake:select config-ref="Snowflake_Config" doc:name="Select ${esc(table)}">
      <snowflake:sql><![CDATA[SELECT * FROM ${table} WHERE ${esc(where)}]]></snowflake:sql>
      <snowflake:input-parameters><![CDATA[#[${JSON.stringify(op.parameters || {})}]]]></snowflake:input-parameters>
    </snowflake:select>
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'database') {
    const table = esc(op.table || data.databaseTable || 'CUSTOMER');
    const fields = op.fields || op.requestFields || [];
    if (action === 'insert' || method === 'POST') {
      const names = fields.length ? fields : ['name', 'email'];
      const cols = names.map(x => esc(x.toUpperCase())).join(', ');
      const binds = names.map(x => ':' + x).join(', ');
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
    const pathParameter = String(op.path || '').match(/\{([^}]+)\}/)?.[1] || null;
    const lookupField = op.lookupField || pathParameter || (fields.find(f => /(?:id|number)$/i.test(String(f))) || 'ID');
    const parameterName = op.parameterName || pathParameter || lookupField;
    const where = op.where || String(lookupField).toUpperCase() + ' = :' + parameterName;
    const input = op.parameters && Object.keys(op.parameters).length
      ? op.parameters
      : { [parameterName]: '#[attributes.uriParams.' + parameterName + ' default payload.' + parameterName + ' default null]' };
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <db:select config-ref="Database_Config" doc:name="Select ${esc(table)}">
      <db:sql><![CDATA[SELECT * FROM ${table} WHERE ${esc(where)}]]></db:sql>
      <db:input-parameters><![CDATA[#[${JSON.stringify(input)}]]]></db:input-parameters>
    </db:select>
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

  if (connector === 'sftp') {
    const filePath = esc(op.filePath || op.path || '${sftp.filePath}');
    const sftpAction = action || 'read';
    const operation = sftpAction === 'write'
      ? `    <sftp:write config-ref="SFTP_Config" path="${filePath}" doc:name="Write file" />`
      : sftpAction === 'list'
        ? `    <sftp:list config-ref="SFTP_Config" path="${filePath}" doc:name="List files" />`
        : `    <sftp:read config-ref="SFTP_Config" path="${filePath}" doc:name="Read file" />`;
    const downstream = op.downstreamEndpoint
      ? `\n    <http:request method="POST" url="${esc(op.downstreamEndpoint)}" doc:name="Call documented downstream API" />`
      : '';
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}${operation}${downstream}
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'object-store') {
    return withErrorHandler(`  <flow name="${name}">
${source(op, data, endpoint, method, status)}    <os:store key="#[attributes.queryParams.key default 'default']" value="#[payload]" doc:name="Store value" />
    <set-variable variableName="httpStatus" value="${status}" />`);
  }

  if (connector === 'file') {
    const filePath = esc(op.filePath || op.path || '${file.path}');
    const fileAction = action || (method === 'GET' ? 'read' : 'write');
    const operation = fileAction === 'write' ? '<file:write path="' + filePath + '" config-ref="File_Config" doc:name="Write file"/>' : '<file:read path="' + filePath + '" config-ref="File_Config" doc:name="Read file"/>';
    return withErrorHandler('  <flow name="' + name + '">\n' + source(op, data, endpoint, method, status) + '    ' + operation + '\n    <set-variable variableName="httpStatus" value="' + status + '"/>');
  }
  if (connector === 'email') {
    return withErrorHandler('  <flow name="' + name + '">\n' + source(op, data, endpoint, method, status) + '    <email:send config-ref="Email_Config" from="${email.from}" to="${email.to}" subject="' + esc(op.subject || 'MuleForge notification') + '" doc:name="Send email"><email:body contentType="text/plain">#[payload as String]</email:body></email:send>\n    <set-variable variableName="httpStatus" value="' + status + '"/>');
  }
  if (connector === 'jms') {
    const destination = esc(op.destination || '${jms.destination}');
    return withErrorHandler('  <flow name="' + name + '">\n' + source(op, data, endpoint, method, status) + '    <jms:publish config-ref="JMS_Config" destination="' + destination + '" doc:name="Publish JMS message"/>\n    <set-variable variableName="httpStatus" value="' + status + '"/>');
  }
  if (connector === 'kafka') {
    const topic = esc(op.topic || '${kafka.topic}');
    return withErrorHandler('  <flow name="' + name + '">\n' + source(op, data, endpoint, method, status) + '    <kafka:publish config-ref="Kafka_Config" topic="' + topic + '" doc:name="Publish Kafka message"/>\n    <set-variable variableName="httpStatus" value="' + status + '"/>');
  }
  if (connector === 'salesforce') {
    const actionName = action || (method === 'GET' ? 'query' : 'create');
    if (actionName === 'query') return withErrorHandler('  <flow name="' + name + '">\n' + source(op, data, endpoint, method, status) + '    <sfdc:query config-ref="Salesforce_Config" doc:name="Query Salesforce"><sfdc:salesforce-query><![CDATA[' + esc(op.query || 'SELECT Id FROM Account LIMIT 10') + ']]></sfdc:salesforce-query></sfdc:query>\n    <set-variable variableName="httpStatus" value="' + status + '"/>');
    return withErrorHandler('  <flow name="' + name + '">\n' + source(op, data, endpoint, method, status) + '    <sfdc:create config-ref="Salesforce_Config" type="' + esc(op.objectType || 'Account') + '" doc:name="Create Salesforce record"/>\n    <set-variable variableName="httpStatus" value="' + status + '"/>');
  }
  return null;
}

module.exports = { connectorFlow };
