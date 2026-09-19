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

function buildTraceability(config = {}, root = null) {
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const assets = (op) => { const id = String(op.name || `${op.method}-${op.path}`).replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase(); const artifactId = String((config.project || {}).artifactId || (config.project || {}).name || 'mule-api'); return { raml: `src/main/resources/api/${artifactId}.raml`, mule: `src/main/mule/${artifactId}.xml`, dataweave: [`src/main/resources/dwl/${id}-request.dwl`, `src/main/resources/dwl/${id}-response.dwl`], munit: `src/test/munit/${artifactId}-test.xml`, postman: `postman/${artifactId}.collection.json`, documentation: 'docs/' }; };
  const requirements = Array.isArray(config.requirements) ? config.requirements : [];
  return {
    version: '1.1', generatedBy: 'MuleForge', requirementCount: requirements.length, operationCount: operations.length,
    requirements: requirements.map(req => ({ requirementId: req.id, source: req.source, text: req.text, status: 'review', targets: ['architecture','implementation','munit','postman','documentation'] })),
    operations: operations.map(op => ({ operation: op.name, method: op.method, path: op.path, connector: op.connector || 'http', targets: ['raml','mule','dataweave','munit','postman','documentation'], assets: assets(op), generated: root ? Object.fromEntries(Object.entries(assets(op)).map(([k,v]) => [k, Array.isArray(v) ? v.every(file => fs.existsSync(path.join(root,file))) : fs.existsSync(path.join(root,v))])) : {},
      references: root ? (() => { const a = assets(op); const n = [op.path, op.name]; return { raml: lineRef(root, a.raml, n), mule: lineRef(root, a.mule, n), dataweave: a.dataweave.map(file => lineRef(root, file, n)).filter(Boolean), munit: lineRef(root, a.munit, n), postman: lineRef(root, a.postman, n) }; })() : {} }))
  };
}

function writeTraceability(root, config) {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const report = buildTraceability(config, root);
  fs.writeFileSync(path.join(root, 'muleforge-traceability.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const rows = report.requirements.map(r => '| ' + r.requirementId + ' | ' + String(r.text || '').replace(/\|/g, '\\|') + ' | ' + r.status + ' | ' + r.targets.join(', ') + ' |');
  const opRows = report.operations.map(o => { const r = o.references || {}; const ref = key => r[key] ? `${r[key].file}${r[key].line ? `:${r[key].line}` : ''}` : '—'; const dw = Array.isArray(r.dataweave) && r.dataweave.length ? r.dataweave.map(x => `${x.file}${x.line ? `:${x.line}` : ''}`).join('<br>') : '—'; return '| ' + o.method + ' ' + o.path + ' | ' + o.connector + ' | RAML: ' + ref('raml') + '<br>Mule: ' + ref('mule') + '<br>DataWeave: ' + dw + '<br>MUnit: ' + ref('munit') + '<br>Postman: ' + ref('postman') + ' |'; });
  const md = '# Requirement Traceability\n\nGenerated from the confirmed MuleForge project model.\n\n## Requirements → generated assets\n\n| Requirement | Text | Status | Targets |\n|---|---|---|---|\n' + (rows.join('\n') || '| — | No parsed requirements | review | — |') + '\n\n## Operations → generated assets\n\n| Operation | Connector | Source references |\n|---|---|---|\n' + (opRows.join('\n') || '| — | — | — |') + '\n';
  fs.writeFileSync(path.join(root, 'docs', '11-traceability.md'), md, 'utf8');
  return report;
}

module.exports = { buildTraceability, writeTraceability, lineRef };