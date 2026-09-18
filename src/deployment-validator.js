const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const TARGETS = new Set(['none','cloudhub','cloudhub2','rtf','onprem']);
function validateDeployment(config = {}) {
  const deployment = config.deployment || {};
  const project = config.project || {};
  const target = String(deployment.target || 'none').toLowerCase();
  const errors = [];
  const warnings = [];
  if (!TARGETS.has(target)) errors.push(`Unsupported deployment.target: ${target}`);
  if (target !== 'none' && !project.name && !project.artifactId) errors.push('Deployment requires project.name or project.artifactId.');
  if (target === 'cloudhub2' && /-SNAPSHOT$/i.test(String(project.version || ''))) errors.push('CloudHub 2.0 deployment requires a release version; do not deploy a SNAPSHOT artifact.');
  if (target === 'cloudhub' && project.workers !== undefined && (!Number.isInteger(Number(project.workers)) || Number(project.workers) < 1)) errors.push('CloudHub workers must be a positive integer.');
  if (project.version && !SEMVER.test(String(project.version))) errors.push('project.version must be a valid semantic version.');
  if (target !== 'none' && !project.muleRuntime) warnings.push('project.muleRuntime is not explicitly set; deployment should use the runtime used to develop the application.');
  return { valid: errors.length === 0, target, errors, warnings };
}
module.exports = { validateDeployment, TARGETS };
