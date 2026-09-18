const test = require('node:test');
const assert = require('node:assert/strict');
const { connectorFlow } = require('../src/connector-flow-generator');

test('generates database insert flow', () => {
  const xml = connectorFlow({ name: 'create-customer', path: '/customers', method: 'POST', connector: 'database', requestFields: ['name', 'email'] }, { artifactId: 'customer-api', basePath: '/api/v1', databaseTable: 'CUSTOMER' });
  assert.match(xml, /db:insert/);
  assert.match(xml, /INSERT INTO CUSTOMER/);
});

test('generates SFTP read flow', () => {
  const xml = connectorFlow({ name: 'read-file', path: '/files', method: 'GET', connector: 'sftp' }, { artifactId: 'file-api', basePath: '/api/v1' });
  assert.match(xml, /sftp:read/);
});

test('generates Anypoint MQ publish flow', () => {
  const xml = connectorFlow({ name: 'publish', path: '/messages', method: 'POST', connector: 'anypoint-mq' }, { artifactId: 'mq-api', basePath: '/api/v1' });
  assert.match(xml, /anypoint-mq:publish/);
});


test('generates documented HTTP downstream flow', () => {
  const xml = connectorFlow({ name: 'get-customer', path: '/customers', method: 'GET', connector: 'http', downstreamEndpoint: 'https://example.test/customers' }, { artifactId: 'customer-api', basePath: '/api/v1' });
  assert.match(xml, /http:request/);
  assert.match(xml, /https:\/\/example\.test\/customers/);
  assert.match(xml, /allowedMethods="GET"/);
});


test('generates IBM MQ publish flow', () => {
  const xml = connectorFlow({ name: 'publish', path: '/messages', method: 'POST', connector: 'ibm-mq', destination: 'CUSTOMER.IN' }, { artifactId: 'mq-api', basePath: '/api/v1' });
  assert.match(xml, /ibm-mq:publish/);
  assert.match(xml, /destination="CUSTOMER.IN"/);
});

test('adds a standard error handler to every supported connector flow', () => {
  for (const connector of ['database', 'sftp', 'anypoint-mq', 'ibm-mq', 'object-store']) {
    const xml = connectorFlow({ name: 'process', path: '/process', method: 'POST', connector }, { artifactId: 'api', basePath: '/api/v1' });
    assert.match(xml, /<error-handler>/);
    assert.match(xml, /type="CONNECTIVITY"/);
    assert.match(xml, /type="ANY"/);
  }
});


test('generates documented SFTP-to-HTTP end-to-end flow', () => {
  const xml = connectorFlow({
    name: 'process-file',
    path: '/files',
    method: 'POST',
    connector: 'sftp',
    filePath: '/inbound/customer',
    downstreamEndpoint: 'https://customer.example.com/v1/customers'
  }, { artifactId: 'file-api', basePath: '/api/v1' });
  assert.match(xml, /sftp:read/);
  assert.match(xml, /http:request/);
  assert.match(xml, /https:\/\/customer\.example\.com\/v1\/customers/);
  assert.match(xml, /<error-handler>/);
});

test('generated connector XML contains real line breaks only', () => {
  for (const connector of ['sftp', 'anypoint-mq']) {
    const xml = connectorFlow({ name: 'process', path: '/process', method: 'POST', connector }, { artifactId: 'api', basePath: '/api/v1' });
    assert.equal(xml.includes('\\n'), false);
  }
});

test('generates native Snowflake operations', () => {
  const insertXml = connectorFlow(
    { name: 'create', path: '/customers', method: 'POST', connector: 'snowflake', requestFields: ['name', 'email'] },
    { artifactId: 'api', basePath: '/api/v1', databaseTable: 'CUSTOMER' }
  );
  assert.match(insertXml, /<snowflake:insert\b/);
  assert.match(insertXml, /config-ref="Snowflake_Config"/);
  const selectXml = connectorFlow(
    { name: 'get', path: '/customers', method: 'GET', connector: 'snowflake', requestFields: ['id'] },
    { artifactId: 'api', basePath: '/api/v1', databaseTable: 'CUSTOMER' }
  );
  assert.match(selectXml, /<snowflake:select\b/);
});


test('generates an explicit HTTP error response for propagated connector failures', () => {
  const xml = connectorFlow(
    { name: 'publish', path: '/messages', method: 'POST', connector: 'ibm-mq', destination: 'CUSTOMER.IN' },
    { artifactId: 'mq-api', basePath: '/api/v1' }
  );
  assert.match(xml, /<http:error-response/);
  assert.match(xml, /<http:body><!\[CDATA\[#\[payload\]\]\]><\/http:body>/);
});

test('generates the configured Kafka flow', () => {
  const xml = connectorFlow(
    { name: 'process', path: '/process', method: 'POST', connector: 'kafka' },
    { artifactId: 'api', basePath: '/api/v1' }
  );
  assert.match(xml, /<kafka:publish/);
  assert.match(xml, /config-ref="Kafka_Config"/);
});
