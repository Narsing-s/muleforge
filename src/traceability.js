const fs = require('fs');
const path = require('path');

function lineRef(root, file, needles = []) {
  if (!root || !file) return null;
  const full = path.join(root, file);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  const values = (Array.isArray(needles) ? needles : [needles]).filter(Boolean).map(String);
  for (let i = 0; i < lines.length; i++) {
    if (values.some(value => value && lines[i].includes(value))) return { file, line: i + 1 };
  }
  return { file, line: null };
}

function ruleTraceability(op, assets) {
  const safe = String(op.name || (op.method + '-' + op.path)).replace(/[^A-Za-z0-9_-]/g, '-');
  const rules = [];
  (Array.isArray(op.validation) ? op.validation : []).forEach((rule, index) => {
    const text = typeof rule === 'string' ? rule : JSON.stringify(rule);
    rules.push({ ruleId: safe + '-validation-' + (index + 1), type: 'validation', source: text, munitTest: safe + '-validation-test', mule: assets.mule });
  });
  const statuses = new Set((Array.isArray(op.errorStatuses) ? op.errorStatuses : []).map(Number).filter(Number.isInteger));
  for (const error of Array.isArray(op.errors) ? op.errors : []) {
    const value = typeof error === 'object' ? (error.status ?? error.code) : Number(error);
    if (Number.isInteger(Number(value))) statuses.add(Number(value));
  }
  [...statuses].sort((a,b) => a-b).forEach(status => {
    const suffix = status === 400 ? 'validation' : status === 409 ? 'conflict-or-duplicate' : [500,502,503,504].includes(status) ? 'connector-error' : 'status-' + status;
    rules.push({ ruleId: safe + '-status-' + status, type: 'error-status', status, source: 'HTTP ' + status, munitTest: safe + '-' + suffix + '-test', mule: assets.mule });
  });
  if (op.retry) rules.push({ ruleId: safe + '-retry', type: 'retry', source: JSON.stringify(op.retry), munitTest: safe + '-retry-exhaustion-test', mule: assets.mule });
  if (op.transaction) rules.push({ ruleId: safe + '-transaction', type: 'transaction', source: 'transaction policy enabled', munitTest: safe + '-transaction-rollback-test', mule: assets.mule });
  if (op.idempotency) rules.push({ ruleId: safe + '-idempotency', type: 'idempotency', source: 'idempotency policy enabled', munitTest: safe + '-idempotency-duplicate-test', mule: assets.mule });
  if (op.pagination) rules.push({ ruleId: safe + '-pagination', type: 'pagination', source: JSON.stringify(op.pagination), munitTest: safe + '-pagination-test', mule: assets.mule });
  return rules;
}
function buildTraceability(config = {}, root = null) {
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const assets = (op) => { const id = String(op.name || `${op.method}-${op.path}`).replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase(); const artifactId = String((config.project || {}).artifactId || (config.project || {}).name || 'mule-api'); return { raml: `src/main/resources/api/${artifactId}.raml`, mule: `src/main/mule/${artifactId}.xml`, dataweave: [`src/main/resources/dwl/${id}-request.dwl`, `src/main/resources/dwl/${id}-response.dwl`], munit: `src/test/munit/${artifactId}-test.xml`, postman: `postman/${artifactId}.collection.json`, functionalMonitoring: `functional-monitoring/tests/${artifactId}.dwl`, documentation: 'docs/' }; };
  const requirements = Array.isArray(config.requirements) && config.requirements.length
    ? config.requirements
    : (String(config.requirement || '').trim() ? [{ id: 'REQ-001', source: 'muleforge.yaml', text: String(config.requirement).trim() }] : []);
  return {
    version: '1.1', generatedBy: 'MuleForge', requirementCount: requirements.length, operationCount: operations.length,
    requirements: requirements.map(req => ({ requirementId: req.id, source: req.source, text: req.text, status: 'review', targets: ['architecture','implementation','munit','postman','functional-monitoring','documentation','deployment'] })),
    operations: operations.map(op => ({ operation: op.name, method: op.method, path: op.path, connector: op.connector || 'http', targets: ['raml','mule','dataweave','munit','postman','functional-monitoring','documentation','deployment'], assets: assets(op), rules: ruleTraceability(op, assets(op)), generated: root ? Object.fromEntries(Object.entries(assets(op)).map(([k,v]) => [k, Array.isArray(v) ? v.every(file => fs.existsSync(path.join(root,file))) : fs.existsSync(path.join(root,v))])) : {},
      references: root ? (() => { const a = assets(op); const n = [op.path, op.name]; return { raml: lineRef(root, a.raml, n), mule: lineRef(root, a.mule, n), dataweave: a.dataweave.map(file => lineRef(root, file, n)).filter(Boolean), munit: lineRef(root, a.munit, n), postman: lineRef(root, a.postman, n), functionalMonitoring: lineRef(root, a.functionalMonitoring, n) }; })() : {} }))
  };
}

function writeTraceability(root, config) {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const report = buildTraceability(config, root);
  fs.writeFileSync(path.join(root, 'muleforge-traceability.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const rows = report.requirements.map(r => '| ' + r.requirementId + ' | ' + String(r.text || '').replace(/\|/g, '\\|') + ' | ' + r.status + ' | ' + r.targets.join(', ') + ' |');
  const opRows = report.operations.map(o => { const r = o.references || {}; const ref = key => r[key] ? `${r[key].file}${r[key].line ? `:${r[key].line}` : ''}` : '—'; const dw = Array.isArray(r.dataweave) && r.dataweave.length ? r.dataweave.map(x => `${x.file}${x.line ? `:${x.line}` : ''}`).join('<br>') : '—'; return '| ' + o.method + ' ' + o.path + ' | ' + o.connector + ' | RAML: ' + ref('raml') + '<br>Mule: ' + ref('mule') + '<br>DataWeave: ' + dw + '<br>MUnit: ' + ref('munit') + '<br>Postman: ' + ref('postman') + '<br>BAT: ' + ref('functionalMonitoring') + ' |'; });
  const ruleRows = report.operations.flatMap(o => (o.rules || []).map(rule => '| ' + rule.ruleId + ' | ' + o.method + ' ' + o.path + ' | ' + rule.type + (rule.status ? ' ' + rule.status : '') + ' | ' + rule.munitTest + ' | ' + rule.mule + ' |'));
  const md = '# Requirement Traceability\n\nGenerated from the confirmed MuleForge project model.\n\n## Requirements → generated assets\n\n| Requirement | Text | Status | Targets |\n|---|---|---|---|\n' + (rows.join('\n') || '| — | No parsed requirements | review | — |') + '\n\n## Operations → generated assets\n\n| Operation | Connector | Source references |\n|---|---|---|\n' + (opRows.join('\n') || '| — | — | — |') + '\n\n## Rules → executable tests\n\n| Rule ID | Operation | Rule | MUnit test | Mule asset |\n|---|---|---|---|---|\n' + (ruleRows.join('\n') || '| — | — | — | — | — |') + '\n';
  fs.writeFileSync(path.join(root, 'docs', '11-traceability.md'), md, 'utf8');
  return report;
}

module.exports = { buildTraceability, writeTraceability, lineRef };