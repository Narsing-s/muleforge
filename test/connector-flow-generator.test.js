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
