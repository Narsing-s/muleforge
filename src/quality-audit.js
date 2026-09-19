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
  for (const f of ['pom.xml','mule-artifact.json','src/main/resources/application.yaml','muleforge-traceability.json','docs/11-traceability.md']) add('Generated ' + f, fs.existsSync(path.join(root,f)), f + ' should exist after generation.');
  add('Postman artifact', fs.existsSync(path.join(root,'postman')), 'Generated projects should contain Postman assets.');
  add('Environment artifacts', ['dev','qa','uat','prod'].every(e => fs.existsSync(path.join(root,'src/main/resources/properties',`application-${e}.yaml`))), 'All four environment property files should exist.');
  const tracePath=path.join(root,'muleforge-traceability.json');
  if(fs.existsSync(tracePath)){ try { const trace=JSON.parse(fs.readFileSync(tracePath,'utf8')); const assetChecks=(trace.operations||[]).flatMap(o=>Object.values(o.generated||{})); add('Traceability evidence', assetChecks.length===0 || assetChecks.every(Boolean), 'Every recorded generated asset should exist on disk.'); } catch { add('Traceability evidence', false, 'muleforge-traceability.json must be valid JSON.'); } }
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\\]\\]/g, match => '\\' + match);
  const generatedRamlPath = path.join(root, 'src', 'main', 'resources', 'api', ((config.project || {}).artifactId || (config.project || {}).name || 'mule-api') + '.raml');
  const generatedMuleDir = path.join(root, 'src', 'main', 'mule');
  const generatedMunitDir = path.join(root, 'src', 'test', 'munit');
  if (operations.length && fs.existsSync(generatedRamlPath)) {
    const raml = fs.readFileSync(generatedRamlPath, 'utf8');
    const missingRaml = operations.filter(op => {
      const method = String(op.method || 'GET').toLowerCase();
      const pathText = String(op.path || '/');
      return !new RegExp('^\\s*' + escapeRegex(pathText) + ':\\s*\\n\\s*' + method + ':', 'm').test(raml);
    });
    add('RAML operation coverage', missingRaml.length === 0, missingRaml.length ? 'Missing generated RAML operations: ' + missingRaml.map(o => o.name || o.path).join(', ') : 'Every configured operation is represented in the generated RAML.');
  }
  const muleFiles = fs.existsSync(generatedMuleDir) ? fs.readdirSync(generatedMuleDir).filter(f => f.endsWith('.xml')).map(f => fs.readFileSync(path.join(generatedMuleDir, f), 'utf8')).join('\n') : '';
  const munitFiles = fs.existsSync(generatedMunitDir) ? fs.readdirSync(generatedMunitDir).filter(f => f.endsWith('.xml')).map(f => fs.readFileSync(path.join(generatedMunitDir, f), 'utf8')).join('\n') : '';
  if (operations.length) {
    const missingFlows = operations.filter(op => {
      const safe = String(op.name || (String(op.method || 'GET') + '-' + String(op.path || '/'))).replace(/[^A-Za-z0-9_-]/g, '-');
      const artifact = String((config.project || {}).artifactId || (config.project || {}).name || 'mule-api');
      return !new RegExp('<flow\\s+name="' + escapeRegex(artifact) + '-' + escapeRegex(safe) + '-flow"').test(muleFiles);
    });
    add('Mule flow coverage', missingFlows.length === 0, missingFlows.length ? 'Missing generated Mule flows: ' + missingFlows.map(o => o.name || o.path).join(', ') : 'Every configured operation has a generated Mule flow.');
    const missingMunit = operations.filter(op => {
      const safe = String(op.name || (String(op.method || 'GET') + '-' + String(op.path || '/'))).replace(/[^A-Za-z0-9_-]/g, '-');
      return !new RegExp('name="' + escapeRegex(safe) + '-happy-path-test"').test(munitFiles);
    });
    add('MUnit operation coverage', missingMunit.length === 0, missingMunit.length ? 'Missing generated MUnit happy-path tests: ' + missingMunit.map(o => o.name || o.path).join(', ') : 'Every configured operation has a generated MUnit happy-path test.');
  }
  const policyChecks = [];
  const artifact = String((config.project || {}).artifactId || (config.project || {}).name || 'mule-api');
  for (const op of operations) {
    const label = op.name || op.path || 'operation';
    const safe = String(op.name || (String(op.method || 'GET') + '-' + String(op.path || '/'))).replace(/[^A-Za-z0-9_-]/g, '-');
    const flowPattern = new RegExp('<flow\\s+name="' + escapeRegex(artifact) + '-' + escapeRegex(safe) + '-flow"([\\s\\S]*?)(?=<flow\\s+name="|</mule>)');
    const flow = muleFiles.match(flowPattern)?.[1] || '';
    if (op.retry && !/<until-successful\b/.test(flow)) policyChecks.push(label + ': retry');
    if (op.pagination && !/queryParams\.page/.test(flow)) policyChecks.push(label + ': pagination');
    if (op.idempotency && !/Idempotency-Key/.test(flow)) policyChecks.push(label + ': idempotency');
    if (op.transaction && !/<try\b/.test(flow)) policyChecks.push(label + ': transaction');
    if (op.timeout && String(op.connector || '').toLowerCase() === 'http' && op.downstreamEndpoint && !/responseTimeout=/.test(flow)) policyChecks.push(label + ': timeout');
  }
  const rateLimitOperations = operations.filter(op => op && op.rateLimit);
  if (rateLimitOperations.length) {
    const policyManifestPath = path.join(root, 'docs', '09-deployment', 'api-manager-policies.json');
    let manifestValid = false;
    if (fs.existsSync(policyManifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(policyManifestPath, 'utf8'));
        const policies = Array.isArray(manifest.policies) ? manifest.policies : [];
        manifestValid = policies.length === rateLimitOperations.length && rateLimitOperations.every(op => {
          const name = op.name || (String(op.method || 'GET') + ' ' + String(op.path || '/'));
          const p = policies.find(x => x.operation === name);
          return p && p.policyType === 'rate-limiting'
            && Number(p.configuration?.rateLimits?.[0]?.maximumRequests) === Number(op.rateLimit.requests)
            && Number(p.configuration?.rateLimits?.[0]?.timePeriodInMilliseconds) === Number(op.rateLimit.periodSeconds) * 1000;
        });
      } catch {}
    }
    add('API Manager rate-limit policy manifest', manifestValid, manifestValid
      ? 'Every configured rate limit has an API Manager policy manifest entry.'
      : 'Configured rate limits require docs/09-deployment/api-manager-policies.json generated by deploy-config.');
  }
  add('Policy generation evidence', policyChecks.length === 0, policyChecks.length ? 'Configured policies without obvious generated evidence: ' + policyChecks.join(', ') : 'Configured retry, pagination, idempotency, transaction and HTTP timeout policies have generated evidence where enabled.');
  const names = operations.map(o => String(o.name || '')).filter(Boolean);
  add('Unique operation names', new Set(names).size === names.length, 'Operation names must be unique.');
  const routes = operations.map(o => String(o.method || 'GET').toUpperCase() + ' ' + String(o.path || '/'));
  add('Unique method/path pairs', new Set(routes).size === routes.length, 'The same HTTP method/path pair should not be generated twice.');
  const secret = /(?:password|client[_-]?secret|access[_-]?token|api[_-]?key)\s*[:=]\s*[\"']?[A-Za-z0-9_\-./+=]{8,}/i;
  const leaked = [];
  function walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(['target','.git','node_modules'].includes(e.name)) continue; if(e.isDirectory()) walk(f); else if(/\.(xml|yaml|yml|json|dwl|md|js|properties)$/.test(e.name) && secret.test(fs.readFileSync(f,'utf8'))) leaked.push(path.relative(root,f)); } }
  walk(root);
  add('Secret hygiene', leaked.length === 0, leaked.length ? 'Potential hard-coded secret in: ' + leaked.join(', ') : 'No obvious hard-coded secrets detected.');
  const sourceFiles = [];
  function scan(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(['target','.git','node_modules'].includes(e.name)) continue; if(e.isDirectory()) scan(f); else sourceFiles.push(f); } }
  scan(root);
  const xmlFiles = sourceFiles.filter(f => f.endsWith('.xml') && f.includes(path.join(root, 'src', 'main', 'mule') + path.sep));
  const malformed = xmlFiles.filter(f => { const s=fs.readFileSync(f,'utf8'); return !s.trim().startsWith('<?xml') || (s.match(/<mule\b/g)||[]).length !== (s.match(/<\/mule>/g)||[]).length; });
  add('Mule XML structural sanity', malformed.length === 0, malformed.length ? 'Potential malformed Mule XML: ' + malformed.map(f=>path.relative(root,f)).join(', ') : 'Mule XML files have a basic root/closing-tag sanity check.');
  const ramlFiles = sourceFiles.filter(f => f.endsWith('.raml'));
  const badRaml = ramlFiles.filter(f => !fs.readFileSync(f,'utf8').startsWith('#%RAML 1.0'));
  add('RAML header', badRaml.length === 0, badRaml.length ? 'Invalid RAML header in: ' + badRaml.map(f=>path.relative(root,f)).join(', ') : 'RAML files declare RAML 1.0.');
  const envFiles = sourceFiles.filter(f => /application-(dev|qa|uat|prod)\.ya?ml$/i.test(f));
  const leakedEnv = envFiles.filter(f => /(?:password|client[_-]?secret|access[_-]?token|api[_-]?key)\s*[:=]\s*[\"']?[A-Za-z0-9_\-./+=]{8,}/i.test(fs.readFileSync(f,"utf8")));
  add('Environment secret hygiene', leakedEnv.length === 0, leakedEnv.length ? 'Potential secret in environment config: ' + leakedEnv.map(f=>path.relative(root,f)).join(', ') : 'Environment configs use placeholders rather than obvious literal secrets.');
  if ((config.deployment || {}).target === 'none') warnings.push('Deployment target is not selected; deployment assets remain environment-neutral.');
  const score = checks.length ? Math.round(checks.filter(c=>c.pass).length / checks.length * 100) : 0;
  return { score, checks, warnings, ready: checks.every(c=>c.pass) };
}
function printAudit(report) { console.log('\n🚀 MuleForge Quality Audit\n'); for (const c of report.checks) console.log((c.pass?'✔':'✖') + ' ' + c.name + ' — ' + c.detail); for (const w of report.warnings) console.log('⚠ ' + w); console.log('\nQuality score: ' + report.score + '%'); console.log(report.ready ? '✓ QUALITY GATE PASSED\n' : '✖ QUALITY GATE FAILED\n'); }
module.exports = { auditProject, printAudit };
