const fs = require('fs');
const path = require('path');

function buildTraceability(config = {}, root = null) {
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const assets = (op) => { const id = String(op.name || `${op.method}-${op.path}`).replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase(); const artifactId = String((config.project || {}).artifactId || (config.project || {}).name || 'mule-api'); return { raml: `src/main/resources/api/${artifactId}.raml`, mule: `src/main/mule/${artifactId}.xml`, dataweave: [`src/main/resources/dwl/${id}-request.dwl`, `src/main/resources/dwl/${id}-response.dwl`], munit: `src/test/munit/${artifactId}-test.xml`, postman: `postman/${artifactId}.collection.json`, documentation: 'docs/' }; };
  const requirements = Array.isArray(config.requirements) ? config.requirements : [];
  return {
    version: '1.0', generatedBy: 'MuleForge', requirementCount: requirements.length, operationCount: operations.length,
    requirements: requirements.map(req => ({ requirementId: req.id, source: req.source, text: req.text, status: 'review', targets: ['architecture','implementation','munit','postman','documentation'] })),
    operations: operations.map(op => ({ operation: op.name, method: op.method, path: op.path, connector: op.connector || 'http', targets: ['raml','mule','dataweave','munit','postman','documentation'], assets: assets(op), generated: root ? Object.fromEntries(Object.entries(assets(op)).map(([k,v]) => [k, Array.isArray(v) ? v.every(file => fs.existsSync(path.join(root,file))) : fs.existsSync(path.join(root,v))])) : {} }))
  };
}

function writeTraceability(root, config) {
  const report = buildTraceability(config, root);
  fs.writeFileSync(path.join(root, 'muleforge-traceability.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const rows = report.requirements.map(r => '| ' + r.requirementId + ' | ' + String(r.text || '').replace(/\|/g, '\\|') + ' | ' + r.status + ' | ' + r.targets.join(', ') + ' |');
  const ops = report.operations.map(o => '| ' + o.method + ' ' + o.path + ' | ' + o.connector + ' | ' + o.targets.join(', ') + ' |');
  const md = '# Requirement Traceability\n\nGenerated from the confirmed MuleForge project model.\n\n## Requirements → generated assets\n\n| Requirement | Text | Status | Targets |\n|---|---|---|---|\n' + (rows.join('\n') || '| — | No parsed requirements | review | — |') + '\n\n## Operations → generated assets\n\n| Operation | Connector | Assets |\n|---|---|---|\n' + (ops.join('\n') || '| — | — | — |') + '\n';
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', '11-traceability.md'), md, 'utf8');
  return report;
}

module.exports = { buildTraceability, writeTraceability };