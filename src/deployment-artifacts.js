const fs = require('fs');
const path = require('path');

function deploymentArtifacts(root, config = {}, data = {}) {
  const dir = path.join(root, '.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  const artifact = data.artifactId || (config.project || {}).artifactId || 'mule-api';
  const common = 'MuleForge generated deployment template. Configure organization-specific secrets, target names and approvals before use.';
  const ch2 = `name: MuleForge CloudHub 2.0 promotion\n\non:\n  workflow_dispatch:\n    inputs:\n      environment:\n        description: Target environment\n        required: true\n        type: choice\n        options: [dev, qa, uat, prod]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    environment: \${{ inputs.environment }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '${data.java || '17'}'\n      - name: Build package\n        run: mvn -B clean package -DskipTests=false\n      - name: Deployment placeholder\n        run: echo '${common} Artifact: ${artifact}. Configure the Anypoint CLI/Maven deployment command for your organization.'\n`;
  const rtf = `name: MuleForge Runtime Fabric package\n\non:\n  workflow_dispatch:\n\njobs:\n  package:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '${data.java || '17'}'\n      - name: Verify and package\n        run: mvn -B clean package -DskipTests=false\n      - name: RTF deployment placeholder\n        run: echo '${common} Configure your organization's Runtime Fabric deployment mechanism.'\n`;
  fs.writeFileSync(path.join(dir, 'deploy-cloudhub2.yml'), ch2, 'utf8');
  fs.writeFileSync(path.join(dir, 'package-rtf.yml'), rtf, 'utf8');
  const docDir = path.join(root, 'docs', '09-deployment'); fs.mkdirSync(docDir, {recursive:true});
  fs.writeFileSync(path.join(docDir, 'deployment-matrix.md'), '# Deployment Matrix\n\n| Target | Generated asset | Credential handling |\n|---|---|---|\n| CloudHub 2.0 | .github/workflows/deploy-cloudhub2.yml | GitHub Environment / approved secret manager |\n| Runtime Fabric | .github/workflows/package-rtf.yml | Organization-specific deployment tooling |\n| CloudHub 1.0 | Maven/package foundation | Organization-specific Anypoint credentials |\n| On-premises | Maven/package foundation | Organization-specific runtime tooling |\n\nThese are safe templates, not a claim that a target is deployable without organization-specific configuration and validation.\n', 'utf8');
}
module.exports = { deploymentArtifacts };