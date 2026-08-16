const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function load(file) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error(`Configuration not found: ${file}`);
  return YAML.parse(fs.readFileSync(full, "utf8")) || {};
}

function deployment(config) {
  const d = config.deployment || {};
  const provider = d.provider || "cloudhub2";
  const defaults = d.defaults || {};
  return { provider, defaults, environments: d.environments || { development: defaults } };
}

function ciWorkflow() {
  return `name: MuleForge CI\n\non:\n  push:\n    branches: [main, master]\n  pull_request:\n\npermissions:\n  contents: read\n\njobs:\n  verify:\n    name: Verify, test and package\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n      - run: npm ci\n      - run: node src/index.js verify\n      - run: node src/index.js test\n      - run: node src/index.js build\n`;
}

function deployWorkflow(config) {
  const d = deployment(config);
  const def = d.defaults || {};
  const app = def.applicationName || `${config.project?.name || "mule-api"}-dev`;
  const runtime = def.runtime || "4.9.0";
  const target = def.target || "Cloudhub-US-East-1";
  const environment = def.environment || "Sandbox";
  const replicas = String(def.replicas || def.workers || 1);
  const vcores = String(def.vCores || def.workerSize || "0.1");
  return `name: Deploy Mule Application to CloudHub 2.0 - DEV\n\non:\n  workflow_dispatch:\n    inputs:\n      environment:\n        description: Anypoint Platform environment name\n        required: true\n        type: string\n        default: ${environment}\n      target:\n        description: CloudHub 2.0 shared/private space target name\n        required: true\n        type: string\n        default: ${target}\n      application_name:\n        description: CloudHub application name\n        required: true\n        type: string\n        default: ${app}\n      mule_runtime:\n        description: Mule runtime version (for example 4.9.0:1e-java17)\n        required: true\n        type: string\n        default: ${runtime}\n      replicas:\n        description: Number of replicas\n        required: true\n        type: string\n        default: "${replicas}"\n      vcores:\n        description: vCores per replica\n        required: true\n        type: choice\n        options:\n          - "0.1"\n          - "0.2"\n          - "0.5"\n          - "1"\n          - "1.5"\n          - "2"\n          - "2.5"\n          - "3"\n          - "3.5"\n          - "4"\n        default: "${vcores}"\n      verify:\n        description: Run MuleForge verification before deployment\n        required: true\n        type: boolean\n        default: true\n      munit:\n        description: Run MUnit before deployment\n        required: true\n        type: boolean\n        default: true\n\npermissions:\n  contents: read\n\njobs:\n  deploy:\n    name: Deploy to CloudHub 2.0 DEV\n    runs-on: ubuntu-latest\n    environment: development\n    steps:\n      - uses: actions/checkout@v4\n\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '17'\n          cache: maven\n\n      - name: Verify MuleForge project\n        if: ${{ inputs.verify }}\n        run: muleforge verify\n\n      - name: MUnit tests\n        if: ${{ inputs.munit }}\n        run: mvn --batch-mode test\n\n      - name: Deploy to CloudHub 2.0\n        env:\n          ANYPOINT_CLIENT_ID: ${{ secrets.ANYPOINT_CLIENT_ID }}\n          ANYPOINT_CLIENT_SECRET: ${{ secrets.ANYPOINT_CLIENT_SECRET }}\n          ANYPOINT_ENVIRONMENT: ${{ inputs.environment }}\n          CLOUDHUB_TARGET: ${{ inputs.target }}\n          CLOUDHUB_APP: ${{ inputs.application_name }}\n          CLOUDHUB_RUNTIME: ${{ inputs.mule_runtime }}\n          CLOUDHUB_REPLICAS: ${{ inputs.replicas }}\n          CLOUDHUB_VCORES: ${{ inputs.vcores }}\n        run: |\n          test -n "$ANYPOINT_CLIENT_ID"\n          test -n "$ANYPOINT_CLIENT_SECRET"\n          mvn --batch-mode clean deploy -Pcloudhub2 -DmuleDeploy \\\n            -Danypoint.clientId="$ANYPOINT_CLIENT_ID" \\\n            -Danypoint.clientSecret="$ANYPOINT_CLIENT_SECRET" \\\n            -Danypoint.environment="$ANYPOINT_ENVIRONMENT" \\\n            -Dcloudhub.target="$CLOUDHUB_TARGET" \\\n            -Dcloudhub.applicationName="$CLOUDHUB_APP" \\\n            -Dcloudhub.muleVersion="$CLOUDHUB_RUNTIME" \\\n            -Dcloudhub.replicas="$CLOUDHUB_REPLICAS" \\\n            -Dcloudhub.vCores="$CLOUDHUB_VCORES"\n`;
}

function init(file = "muleforge.yaml") {
  const config = load(file);
  const root = path.resolve(path.dirname(file));
  const d = deployment(config);
  write(path.join(root, ".github/workflows/ci.yml"), ciWorkflow());
  if (d.provider !== "cloudhub2") throw new Error(`Unsupported deployment provider: ${d.provider}`);
  write(path.join(root, ".github/workflows/deploy-dev.yml"), deployWorkflow(config));
  write(path.join(root, "docs/cicd/generated-pipeline.md"), `# Generated CI/CD Pipeline\n\nProvider: **GitHub Actions**\n\nDeployment target: **CloudHub 2.0**\n\nThe DEV workflow is manually triggered from GitHub Actions and exposes environment, target, application name, Mule runtime, replicas, vCores, verification and MUnit inputs.\n\n## Required GitHub Environment\n\nCreate an environment named \\`development\\` and configure:\n\n- \\`ANYPOINT_CLIENT_ID\\`\n- \\`ANYPOINT_CLIENT_SECRET\\`\n\nThe Connected App is used through the Mule Maven Plugin with grant type \\`client_credentials\\`.\n\nNever commit credentials to the repository.\n\n## Validate\n\nRun \\`muleforge cicd validate\\` before pushing.\n`);
  console.log("\n✔ GitHub Actions CI generated");
  console.log("✔ Interactive CloudHub 2.0 DEV deployment generated");
  console.log("✔ Secret configuration documentation generated\n");
}

function validate(file = "muleforge.yaml") {
  load(file);
  const root = path.resolve(path.dirname(file));
  const required = [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-dev.yml",
    "docs/cicd/generated-pipeline.md"
  ];
  let ok = true;
  for (const f of required) {
    const exists = fs.existsSync(path.join(root, f));
    console.log(`${exists ? "✔" : "✖"} ${f}`);
    if (!exists) ok = false;
  }
  const workflow = path.join(root, ".github/workflows/deploy-dev.yml");
  if (fs.existsSync(workflow)) {
    const text = fs.readFileSync(workflow, "utf8");
    for (const token of ["workflow_dispatch", "ANYPOINT_CLIENT_ID", "ANYPOINT_CLIENT_SECRET", "application_name", "target", "mule_runtime", "replicas", "vcores", "-Pcloudhub2", "-DmuleDeploy"]) {
      const exists = text.includes(token);
      console.log(`${exists ? "✔" : "✖"} ${token}`);
      if (!exists) ok = false;
    }
    if (/ANYPOINT_CLIENT_SECRET:\s*[^$\n]+/i.test(text)) {
      console.log("✖ Possible hard-coded Anypoint secret");
      ok = false;
    }
  }
  console.log(ok ? "\nRESULT: CI/CD READY FOR REVIEW" : "\nRESULT: CI/CD CONFIGURATION INCOMPLETE");
  return ok;
}

module.exports = { init, validate };
