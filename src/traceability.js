const fs = require('fs');
const path = require('path');

function buildTraceability(config = {}) {
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const requirements = Array.isArray(config.requirements) ? config.requirements : [];
  return {
    version: '1.0', generatedBy: 'MuleForge', requirementCount: requirements.length, operationCount: operations.length,
    requirements: requirements.map(req => ({ requirementId: req.id, source: req.source, text: req.text, status: 'review', targets: ['architecture','implementation','munit','postman','documentation'] })),
    operations: operations.map(op => ({ operation: op.name, method: op.method, path: op.path, connector: op.connector || 'http', targets: ['raml','mule','dataweave','munit','postman','documentation'] }))
  };
}

function writeTraceability(root, config) {
  const report = buildTraceability(config);
  fs.writeFileSync(path.join(root, 'muleforge-traceability.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const rows = report.requirements.map(r => '| ' + r.requirementId + ' | ' + String(r.text || '').replace(/\|/g, '\\|') + ' | ' + r.status + ' | ' + r.targets.join(', ') + ' |');
  const ops = report.operations.map(o => '| ' + o.method + ' ' + o.path + ' | ' + o.connector + ' | ' + o.targets.join(', ') + ' |');
  const md = '# Requirement Traceability\n\nGenerated from the confirmed MuleForge project model.\n\n## Requirements → generated assets\n\n| Requirement | Text | Status | Targets |\n|---|---|---|---|\n' + (rows.join('\n') || '| — | No parsed requirements | review | — |') + '\n\n## Operations → generated assets\n\n| Operation | Connector | Assets |\n|---|---|---|\n' + (ops.join('\n') || '| — | — | — |') + '\n';
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', '11-traceability.md'), md, 'utf8');
  return report;
}

module.exports = { buildTraceability, writeTraceability };