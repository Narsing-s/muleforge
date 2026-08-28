function safe(value) { return String(value || 'mapping').replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase(); }

function typeFor(field) {
  if (typeof field === 'string') return { name: field, type: 'String' };
  return { name: field.name, type: field.type || 'String' };
}

function generateDataWeaveFiles(config = {}) {
  const operations = config.operations || [];
  return operations.map(op => {
    const request = (op.requestFields || []).map(typeFor);
    const response = (op.responseFields || []).map(typeFor);
    const name = safe(op.name);
    const requestBody = request.length
      ? `{\n${request.map(f => `  ${f.name}: payload.${f.name} default null`).join(',\n')}\n}`
      : 'payload';
    const responseBody = response.length
      ? `{\n${response.map(f => `  ${f.name}: payload.${f.name} default null`).join(',\n')}\n}`
      : 'payload';
    return {
      name,
      request: `%dw 2.0\noutput application/json\n---\n${requestBody}\n`,
      response: `%dw 2.0\noutput application/json\n---\n${responseBody}\n`,
      requestFields: request,
      responseFields: response
    };
  });
}

module.exports = { generateDataWeaveFiles, typeFor };
