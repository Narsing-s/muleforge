const test = require('node:test');
const assert = require('node:assert/strict');
const { generateDataWeaveFiles } = require('../src/dataweave-generator');

test('generates typed request and response mappings', () => {
  const result = generateDataWeaveFiles({ operations: [{ name: 'Create Customer', requestFields: [{ name: 'email', type: 'String' }], responseFields: [{ name: 'customerId', type: 'String' }] }] });
  assert.equal(result.length, 1);
  assert.match(result[0].request, /payload\.email/);
  assert.match(result[0].response, /payload\.customerId/);
});
