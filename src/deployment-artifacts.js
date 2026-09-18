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
  const ch2Validation = chValidation.replace('ANYPOINT_ENVIRONMENT: ${{ inputs.environment }}','ANYPOINT_ENVIRONMENT: ${{ inputs.environment }}\n    ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}').replace('test -n "$ANYPOINT_ENVIRONMENT" || { echo "::error::ANYPOINT_ENVIRONMENT is required."; exit 1; }','test -n "$ANYPOINT_TARGET" || { echo "::error::ANYPOINT_TARGET is required."; exit 1; }\n          test -n "$ANYPOINT_ENVIRONMENT" || { echo "::error::ANYPOINT_ENVIRONMENT is required."; exit 1; }');
  const ch2Command = chCommand.replace('-Dmuleforge.cloudhub=true','-Dmuleforge.cloudhub2=true').replace('-Danypoint.applicationName="$ANYPOINT_APPLICATION_NAME"', '-Danypoint.target="$ANYPOINT_TARGET" -Danypoint.applicationName="$ANYPOINT_APPLICATION_NAME"');
  const rtfValidation = ch2Validation.replace('ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}','ANYPOINT_TARGET: ${{ vars.ANYPOINT_TARGET }}');
  const rtfCommand = ch2Command.replace('-Dmuleforge.cloudhub2=true','-Dmuleforge.rtf=true');
  fs.writeFileSync(path.join(dir, 'deploy-cloudhub.yml'), target === 'cloudhub' ? enabledWorkflow('MuleForge CloudHub promotion', java, chValidation, chCommand) : disabled('MuleForge CloudHub promotion', artifact, target), 'utf8');
  fs.writeFileSync(path.join(dir, 'deploy-cloudhub2.yml'), target === 'cloudhub2' ? enabledWorkflow('MuleForge CloudHub 2.0 promotion', java, ch2Validation, ch2Command) : disabled('MuleForge CloudHub 2.0 promotion', artifact, target), 'utf8');
  fs.writeFileSync(path.join(dir, 'deploy-rtf.yml'), target === 'rtf' ? enabledWorkflow('MuleForge Runtime Fabric promotion', java, rtfValidation, rtfCommand) : disabled('MuleForge Runtime Fabric promotion', artifact, target), 'utf8');
  const docDir = path.join(root, 'docs', '09-deployment');
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, 'deployment-matrix.md'), '# Deployment Matrix\n\n| Target | Workflow | Maven strategy |\n|---|---|---|\n| CloudHub 1.0 | `.github/workflows/deploy-cloudhub.yml` | `cloudHubDeployment` |\n| CloudHub 2.0 | `.github/workflows/deploy-cloudhub2.yml` | `cloudhub2Deployment` |\n| Runtime Fabric | `.github/workflows/deploy-rtf.yml` | `runtimeFabricDeployment` |\n| On-premises | Maven/package foundation | Organization-specific |\n\nOnly the workflow matching `deployment.target` is enabled. Other generated workflows are safe no-op templates.\n\nCredentials are supplied through Maven `settings.xml` stored as an approved GitHub secret; usernames, passwords, tokens and client secrets are never generated into workflow files.\n', 'utf8');
}
module.exports = { deploymentArtifacts };