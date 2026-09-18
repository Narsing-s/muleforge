const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function auditProject(file = 'muleforge.yaml') {
  const root = path.resolve(path.dirname(file));
  const config = YAML.parse(fs.readFileSync(path.resolve(file), 'utf8')) || {};
  const operations = Array.isArray(config.operations) ? config.operations : [];
  const checks = []; const warnings = [];
  const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
  add('Requirement model', Boolean(String(config.requirement || '').trim()), 'A confirmed requirement is present.');
  add('API operations', operations.length > 0, 'At least one operation is defined.');
  add('Connector mappings', operations.every(op => op.connector || !(config.connectors || []).length), 'Each operation should have an explicit connector when multiple connectors are selected.');
  add('No unresolved conflicts', !(config.conflicts || []).length, 'Requirement/document conflicts must be resolved.');
  add('No missing non-secret configuration', !(config.missingConfigurations || []).length, 'Required connectivity values should be resolved; secrets may remain placeholders.');
  for (const f of ['pom.xml','mule-artifact.json','src/main/resources/application.yaml','muleforge-traceability.json']) add('Generated ' + f, fs.existsSync(path.join(root,f)), f + ' should exist after generation.');
  const names = operations.map(o => String(o.name || '')).filter(Boolean);
  add('Unique operation names', new Set(names).size === names.length, 'Operation names must be unique.');
  const routes = operations.map(o => String(o.method || 'GET').toUpperCase() + ' ' + String(o.path || '/'));
  add('Unique method/path pairs', new Set(routes).size === routes.length, 'The same HTTP method/path pair should not be generated twice.');
  const secret = /(?:password|client[_-]?secret|access[_-]?token|api[_-]?key)\s*[:=]\s*["']?(?!\$\{|\*{3,}|<[^>]+>)[A-Za-z0-9_\-./+=]{8,}/i;
  const leaked = [];
  function walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(['target','.git','node_modules'].includes(e.name)) continue; if(e.isDirectory()) walk(f); else if(/\.(xml|yaml|yml|json|dwl|md|js|properties)$/.test(e.name) && secret.test(fs.readFileSync(f,'utf8'))) leaked.push(path.relative(root,f); } }
  walk(root);
  add('Secret hygiene', leaked.length === 0, leaked.length ? 'Potential hard-coded secret in: ' + leaked.join(', ') : 'No obvious hard-coded secrets detected.');
  if ((config.deployment || {}).target === 'none') warnings.push('Deployment target is not selected; deployment assets remain environment-neutral.');
  const score = checks.length ? Math.round(checks.filter(c=>c.pass).length / checks.length * 100) : 0;
  return { score, checks, warnings, ready: checks.every(c=>c.pass) };
}
function printAudit(report) { console.log('\n🚀 MuleForge Quality Audit\n'); for (const c of report.checks) console.log((c.pass?'✔':'✖') + ' ' + c.name + ' — ' + c.detail); for (const w of report.warnings) console.log('⚠ ' + w); console.log('\nQuality score: ' + report.score + '%'); console.log(report.ready ? '✓ QUALITY GATE PASSED\n' : '✖ QUALITY GATE FAILED\n'); }
module.exports = { auditProject, printAudit };