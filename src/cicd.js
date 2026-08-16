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
  const regions = (d.regions || [def.region || "us-east-1"]).join("\n          - ");
  const runtimes = (d.runtimes || [def.runtime || "4.9.0"]).join("\n          - ");
  const app = def.applicationName || `${config.project?.name || "mule-api"}-dev`;
  return `name: Deploy Mule Application to CloudHub 2.0 - DEV\n\non:\n  workflow_dispatch:\n    inputs:\n      environment:\n        description: Deployment environment\n        required: true\n        type: choice\n        options:\n          - development\n      region:\n        description: CloudHub 2.0 region\n        required: true\n        type: choice\n        options:\n          - ${regions}\n        default: ${def.region || "us-east-1"}\n      application_name:\n        description: CloudHub application name\n        required: true\n        type: string\n        default: ${app}\n      mule_runtime:\n        description: Mule runtime version\n        required: true\n        type: choice\n        options:\n          - ${runtimes}\n        default: ${def.runtime || "4.9.0"}\n      workers:\n        description: Number of workers\n        required: true\n        type: choice\n        options: ["1", "2", "3"]\n        default: "1"\n      worker_size:\n        description: Worker size in vCores\n        required: true\n        type: choice\n        options: ["0.1", "0.2", "0.5", "1.0"]\n        default: "${def.workerSize || "0.1"}"\n      verify:\n        description: Run MuleForge verification before deployment\n        required: true\n        type: boolean\n        default: true\n      munit:\n        description: Run MUnit before deployment\n        required: true\n        type: boolean\n        default: true\n\npermissions:\n  contents: read\n\njobs:\n  deploy:\n    name: Deploy to CloudHub 2.0 DEV\n    runs-on: ubuntu-latest\n    environment: development\n    steps:\n      - uses: actions/checkout@v4\n\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '17'\n          cache: maven\n\n      - run: npm ci\n\n      - name: MuleForge verification\n        if: ${{ inputs.verify }}\n        run: node src/index.js verify\n\n      - name: MUnit tests\n        if: ${{ inputs.munit }}\n        run: node src/index.js test\n\n      - name: Package application\n        run: node src/index.js build\n\n      - name: Deploy\n        env:\n          ANYPOINT_CLIENT_ID: ${{ secrets.ANYPOINT_CLIENT_ID }}\n          ANYPOINT_CLIENT_SECRET: ${{ secrets.ANYPOINT_CLIENT_SECRET }}\n          ANYPOINT_REGION: ${{ inputs.region }}\n          MULE_RUNTIME: ${{ inputs.mule_runtime }}\n          WORKERS: ${{ inputs.workers }}\n          WORKER_SIZE: ${{ inputs.worker_size }}\n          APPLICATION_NAME: ${{ inputs.application_name }}\n        run: |\n          echo "CloudHub 2.0 deployment requested for ${APPLICATION_NAME}"\n          echo "Region: ${ANYPOINT_REGION}; Runtime: ${MULE_RUNTIME}; Workers: ${WORKERS}; Size: ${WORKER_SIZE}"\n          echo "Configure the Mule Maven CloudHub 2.0 deployment plugin/profile for this organization's target before enabling the actual deployment command."\n          test -n "$ANYPOINT_CLIENT_ID"\n          test -n "$ANYPOINT_CLIENT_SECRET"\n`;
}

function init(file = "muleforge.yaml") {
  const config = load(file);
  const root = path.resolve(path.dirname(file));
  const d = deployment(config);
  write(path.join(root, ".github/workflows/ci.yml"), ciWorkflow());
  if (d.provider !== "cloudhub2") throw new Error(`Unsupported deployment provider: ${d.provider}`);
  write(path.join(root, ".github/workflows/deploy-dev.yml"), deployWorkflow(config));
  write(path.join(root, "docs/cicd/generated-pipeline.md"), `# Generated CI/CD Pipeline\n\nProvider: **GitHub Actions**\n\nDeployment target: **CloudHub 2.0**\n\nThe DEV workflow is manually triggered from GitHub Actions and exposes environment, region, application name, Mule runtime, workers, worker size, verification and MUnit inputs.\n\n## Required GitHub Environment\n\nCreate an environment named \\`development\\` and configure:\n\n- \\`ANYPOINT_CLIENT_ID\\`\n- \\`ANYPOINT_CLIENT_SECRET\\`\n\nNever commit credentials to the repository.\n\n## Validate\n\nRun \\`muleforge cicd validate\\` before pushing.\n`);
  console.log("\n✔ GitHub Actions CI generated");
  console.log("✔ Interactive CloudHub 2.0 DEV deployment generated");
  console.log("✔ Secret configuration documentation generated\n");
}

function validate(file = "muleforge.yaml") {
  const config = load(file);
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
    for (const token of ["workflow_dispatch", "ANYPOINT_CLIENT_ID", "ANYPOINT_CLIENT_SECRET", "application_name", "region", "mule_runtime"]) {
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
