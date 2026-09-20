const fs = require('fs');
const path = require('path');

function workflowHeader(name, java) {
  return [
    'name: ' + name,
    '',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      environment:',
    '        description: Target Anypoint Platform environment',
    '        required: true',
    '        type: choice',
    '        options: [dev, qa, uat, prod]',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  deploy:',
    '    runs-on: ubuntu-latest',
    '    environment: ${{ inputs.environment }}',
    '    steps:',
    '      - uses: actions/checkout@v6',
    '      - uses: actions/setup-java@v5',
    '        with:',
    '          distribution: temurin',
    '          java-version: ' + java,
    '          cache: maven',
    '      - name: Require Maven deployment settings',
    '        env:',
    '          MAVEN_SETTINGS_XML: ${{ secrets.MAVEN_SETTINGS_XML }}',
    '        run: |',
    '          test -n "$MAVEN_SETTINGS_XML" || { echo "::error::MAVEN_SETTINGS_XML is required."; exit 1; }',
    '          mkdir -p "$HOME/.m2"',
    '          printf "%s" "$MAVEN_SETTINGS_XML" > "$HOME/.m2/settings.xml"'
  ].join('\n');
}

function disabled(name, artifact, target) {
  return ['name: ' + name, '', 'on:', '  workflow_dispatch:', '', 'permissions:', '  contents: read', '', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v6', '      - name: Deployment not enabled', '        run: echo "MuleForge deployment is not enabled for deployment.target=' + target + '. Artifact: ' + artifact + '."'].join('\n');
}

function enabledWorkflow(name, java, validation, command) {
  return workflowHeader(name, JSON.stringify(java || '17')) + '\n' + validation + '\n' + command;
}


function smokeStep() {
  return [
    '      - name: Post-deployment smoke verification',
    '        env:',
    '          MULEFORGE_SMOKE_URL: ${{ vars.MULEFORGE_SMOKE_URL }}',
    '        run: |',
    '          if [ -z "$MULEFORGE_SMOKE_URL" ]; then echo "No MULEFORGE_SMOKE_URL configured; deployment completed without live smoke verification."; exit 0; fi',
    '          code=$(curl -sS -o /tmp/muleforge-smoke.json -w "%{http_code}" --fail-with-body "$MULEFORGE_SMOKE_URL")',
    '          case "$code" in 2*) echo "Smoke verification passed: HTTP $code";; *) echo "::error::Smoke verification failed: HTTP $code"; exit 1;; esac'
  ].join('\n');
}
function deploymentArtifacts(root, config = {}, data = {}) {
  const dir = path.join(root, '.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  const artifact = data.artifactId || (config.project || {}).artifactId || 'mule-api';
  const target = String((config.deployment || {}).target || 'none').toLowerCase();
  const java = data.java || '17';
  const chValidation = [
    '      - name: Validate deployment inputs',
    '        env:',
    '          ANYPOINT_ENVIRONMENT: ${{ inputs.environment }}',
    '          ANYPOINT_APPLICATION_NAME: ${{ vars.ANYPOINT_APPLICATION_NAME }}',
    '        run: |',
    '          test -n "$ANYPOINT_APPLICATION_NAME" || { echo "::error::ANYPOINT_APPLICATION_NAME is required."; exit 1; }',
    '          test -n "$ANYPOINT_ENVIRONMENT" || { echo "::error::ANYPOINT_ENVIRONMENT is required."; exit 1; }'
  ].join('\n');
  const chCommand = [
    '      - name: Deploy to CloudHub',
    '        env:',
    '          ANYPOINT_URI: ${{ vars.ANYPOINT_URI || "https://anypoint.mulesoft.com" }}',
    '          ANYPOINT_ENVIRONMENT: ${{ inputs.environment }}',
    '          ANYPOINT_APPLICATION_NAME: ${{ vars.ANYPOINT_APPLICATION_NAME }}',
    '          ANYPOINT_REGION: ${{ vars.ANYPOINT_REGION || "us-east-1" }}',
    '          ANYPOINT_WORKERS: ${{ vars.ANYPOINT_WORKERS || "1" }}',
    '          ANYPOINT_WORKER_TYPE: ${{ vars.ANYPOINT_WORKER_TYPE || "MICRO" }}',
    '        run: |',
    '          mvn -B -s "$HOME/.m2/settings.xml" -Dmuleforge.cloudhub=true \\',
    '            -Danypoint.uri="$ANYPOINT_URI" -Danypoint.environment="$ANYPOINT_ENVIRONMENT" \\',
    '            -Danypoint.applicationName="$ANYPOINT_APPLICATION_NAME" -Danypoint.region="$ANYPOINT_REGION" \\',
    '            -Danypoint.workers="$ANYPOINT_WORKERS" -Danypoint.workerType="$ANYPOINT_WORKER_TYPE" \\',
    '            clean deploy -DskipTests=false -DmuleDeploy'
  ].join('\n');
  const ch2Validation = [
    '      - name: Validate deployment inputs',
    '        env:',
    '          ANYPOINT_ENVIRONMENT: ${{ inputs.environment }}',
    '          ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}',
    '          ANYPOINT_APPLICATION_NAME: ${{ vars.ANYPOINT_APPLICATION_NAME }}',
    '        run: |',
    '          test -n "$ANYPOINT_APPLICATION_NAME" || { echo "::error::ANYPOINT_APPLICATION_NAME is required."; exit 1; }',
    '          test -n "$ANYPOINT_ENVIRONMENT" || { echo "::error::ANYPOINT_ENVIRONMENT is required."; exit 1; }',
    '          test -n "$ANYPOINT_TARGET" || { echo "::error::ANYPOINT_TARGET is required."; exit 1; }'
  ].join('\n');
  const ch2Command = chCommand.replace('-Dmuleforge.cloudhub=true','-Dmuleforge.cloudhub2=true').replace('-Danypoint.applicationName="$ANYPOINT_APPLICATION_NAME"', '-Danypoint.target="$ANYPOINT_TARGET" -Danypoint.applicationName="$ANYPOINT_APPLICATION_NAME"');
  const rtfValidation = ch2Validation.replace('ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}','ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}');
  const rtfCommand = ch2Command.replace('-Dmuleforge.cloudhub2=true','-Dmuleforge.rtf=true');
  fs.writeFileSync(path.join(dir, 'deploy-cloudhub.yml'), target === 'cloudhub' ? enabledWorkflow('MuleForge CloudHub promotion', java, chValidation, chCommand + smokeStep()) : disabled('MuleForge CloudHub promotion', artifact, target), 'utf8');
  fs.writeFileSync(path.join(dir, 'deploy-cloudhub2.yml'), target === 'cloudhub2' ? enabledWorkflow('MuleForge CloudHub 2.0 promotion', java, ch2Validation, ch2Command + smokeStep()) : disabled('MuleForge CloudHub 2.0 promotion', artifact, target), 'utf8');
  fs.writeFileSync(path.join(dir, 'deploy-rtf.yml'), target === 'rtf' ? enabledWorkflow('MuleForge Runtime Fabric promotion', java, rtfValidation, rtfCommand + smokeStep()) : disabled('MuleForge Runtime Fabric promotion', artifact, target), 'utf8');
  const onpremValidation = [
    '      - name: Validate on-premises deployment inputs',
    '        env:',
    '          ANYPOINT_ENVIRONMENT: ${{ vars.ANYPOINT_ENVIRONMENT }}',
    '          ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}',
    '          ANYPOINT_TARGET_TYPE: ${{ vars.ANYPOINT_TARGET_TYPE || "server" }}',
    '          ANYPOINT_APPLICATION_NAME: ${{ vars.ANYPOINT_APPLICATION_NAME }}',
    '        run: |',
    '          test -n "$ANYPOINT_ENVIRONMENT" || { echo "::error::ANYPOINT_ENVIRONMENT is required."; exit 1; }',
    '          test -n "$ANYPOINT_TARGET" || { echo "::error::ANYPOINT_TARGET is required."; exit 1; }',
    '          test -n "$ANYPOINT_APPLICATION_NAME" || { echo "::error::ANYPOINT_APPLICATION_NAME is required."; exit 1; }'
  ].join('\n');
  const onpremCommand = [
    '      - name: Deploy on-premises through Runtime Manager',
    '        env:',
    '          ANYPOINT_URI: ${{ vars.ANYPOINT_URI || "https://anypoint.mulesoft.com" }}',
    '          ANYPOINT_ENVIRONMENT: ${{ vars.ANYPOINT_ENVIRONMENT }}',
    '          ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}',
    '          ANYPOINT_TARGET_TYPE: ${{ vars.ANYPOINT_TARGET_TYPE || "server" }}',
    '          ANYPOINT_APPLICATION_NAME: ${{ vars.ANYPOINT_APPLICATION_NAME }}',
    '        run: |',
    '          mvn -B -s "$HOME/.m2/settings.xml" -Dmuleforge.onprem=true \\',
    '            -Danypoint.uri="$ANYPOINT_URI" -Danypoint.environment="$ANYPOINT_ENVIRONMENT" \\',
    '            -Danypoint.target="$ANYPOINT_TARGET" -Danypoint.targetType="$ANYPOINT_TARGET_TYPE" \\',
    '            -Danypoint.applicationName="$ANYPOINT_APPLICATION_NAME" clean deploy -DskipTests=false -DmuleDeploy'
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'deploy-onprem.yml'), target === 'onprem' ? enabledWorkflow('MuleForge on-premises promotion', java, onpremValidation, onpremCommand + smokeStep()) : disabled('MuleForge on-premises promotion', artifact, target), 'utf8');
  const docDir = path.join(root, 'docs', '09-deployment');
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, 'deployment-matrix.md'), '# Deployment Matrix\n\n| Target | Workflow | Maven strategy |\n|---|---|---|\n| CloudHub 1.0 | `.github/workflows/deploy-cloudhub.yml` | `cloudHubDeployment` |\n| CloudHub 2.0 | `.github/workflows/deploy-cloudhub2.yml` | `cloudhub2Deployment` |\n| Runtime Fabric | `.github/workflows/deploy-rtf.yml` | `runtimeFabricDeployment` |\n| On-premises | .github/workflows/deploy-onprem.yml | armDeployment / Runtime Manager |\n\nOnly the workflow matching `deployment.target` is enabled. Other generated workflows are safe no-op templates.\n\nCredentials are supplied through Maven `settings.xml` stored as an approved GitHub secret; usernames, passwords, tokens and client secrets are never generated into workflow files.\n', 'utf8');
  const rateLimitOperations = (config.operations || []).filter(op => op && op.rateLimit);
  const policyManifest = rateLimitOperations.map(op => ({
    operation: op.name || (String(op.method || 'GET') + ' ' + String(op.path || '/')),
    policyType: 'rate-limiting',
    policyVersion: '1.2.0',
    configuration: {
      rateLimits: [{
        maximumRequests: Number(op.rateLimit.requests),
        timePeriodInMilliseconds: Number(op.rateLimit.periodSeconds) * 1000
      }],
      clusterizable: true,
      exposeHeaders: true
    },
    pointcut: [{
      methodRegex: String(op.method || 'GET').toUpperCase(),
      uriTemplateRegex: String(op.path || '/')
    }]
  }));
  if (policyManifest.length) {
    fs.writeFileSync(
      path.join(docDir, 'api-manager-policies.json'),
      JSON.stringify({
        generatedBy: 'MuleForge',
        policyModel: 'Mule Gateway API Manager',
        note: 'Apply these policy configurations through API Manager or Anypoint CLI. Rate limiting is intentionally not implemented as an in-application counter.',
        policies: policyManifest
      }, null, 2) + '\n',
      'utf8'
    );
  }
}
module.exports = { deploymentArtifacts };