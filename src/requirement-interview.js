const readline = require('readline/promises');
const { stdin, stdout } = require('process');

function parseRequirement(text) {
  const lower = text.toLowerCase();
  const methods = [...text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s,.;]+)/gi)]
    .map(m => ({ method: m[1].toUpperCase(), path: m[2] }));
  const fields = [];
  const fieldMatch = text.match(/(?:accept|fields?|parameters?)\s*[:\-]?\s*([^\.]+)/i);
  if (fieldMatch) fields.push(...fieldMatch[1].split(/,|\band\b/i).map(s => s.trim()).filter(Boolean));
  const connectors = ['http'];
  if (/snowflake/.test(lower)) connectors.push('snowflake');
  if (/\b(mysql|postgres(?:ql)?|oracle|database)\b/.test(lower)) connectors.push('database');
  if (/\bsftp\b|file transfer/.test(lower)) connectors.push('sftp');
  if (/ibm\s*mq|queue manager/.test(lower)) connectors.push('ibm-mq');
  if (/anypoint\s*mq|message queue/.test(lower)) connectors.push('anypoint-mq');
  if (/object\s*store|cache/.test(lower)) connectors.push('object-store');
  const validation = [];
  if (/validat\w*.*email|email.*valid/.test(lower)) validation.push('email format');
  if (/required|mandatory/.test(lower)) validation.push('required fields');
  const errors = [];
  if (/duplicate|already exists|existing customer/.test(lower)) errors.push('duplicate record');
  if (/not found/.test(lower)) errors.push('resource not found');
  return { raw: text.trim(), operations: methods, fields, connectors: [...new Set(connectors)], validation, errors };
}

async function ask(rl, question, fallback = '') {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback;
}

async function interview(requirement) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const model = parseRequirement(requirement);
  console.log('\n🚀 MuleForge Adaptive Requirement Interview\n');
  if (!model.operations.length) {
    const operation = await ask(rl, 'Which HTTP operation and path should be created?', 'POST /customers');
    const m = operation.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)$/i);
    if (m) model.operations.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  if (!model.fields.length) {
    const fields = await ask(rl, 'What request fields are required?', 'name, email, mobileNumber');
    model.fields = fields.split(/,|\band\b/i).map(s => s.trim()).filter(Boolean);
  }
  if (!model.validation.length) {
    const validation = await ask(rl, 'What validation rules should be applied?', 'required fields');
    model.validation = validation.split(/,|\band\b/i).map(s => s.trim()).filter(Boolean);
  }
  if (model.connectors.length === 1) {
    const backend = await ask(rl, 'Which backend/system should the API call?', 'none');
    const b = backend.toLowerCase();
    if (/snowflake/.test(b)) model.connectors.push('snowflake');
    else if (/database|mysql|postgres|oracle/.test(b)) model.connectors.push('database');
    else if (/sftp/.test(b)) model.connectors.push('sftp');
  }
  if (!model.errors.length) {
    const errors = await ask(rl, 'What business error cases must be handled?', 'validation error, backend error');
    model.errors = errors.split(/,|\band\b/i).map(s => s.trim()).filter(Boolean);
  }
  const successStatus = await ask(rl, 'What success HTTP status should be returned?', model.operations.some(o => o.method === 'POST') ? '201' : '200');
  model.successStatus = Number(successStatus) || 200;
  console.log('\n📐 Proposed solution\n');
  console.log(`Operations: ${model.operations.map(o => `${o.method} ${o.path}`).join(', ')}`);
  console.log(`Fields: ${model.fields.join(', ')}`);
  console.log(`Connectors: ${model.connectors.join(', ')}`);
  console.log(`Validation: ${model.validation.join(', ')}`);
  console.log(`Errors: ${model.errors.join(', ')}`);
  console.log(`Success: HTTP ${model.successStatus}`);
  const approved = (await ask(rl, 'Generate this solution? (yes/no)', 'yes')).toLowerCase();
  rl.close();
  if (!['y', 'yes'].includes(approved)) throw new Error('Generation cancelled by user');
  return model;
}

module.exports = { parseRequirement, interview };
