const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { deploymentArtifacts } = require("../src/deployment-artifacts");

test("deployment workflows include optional post-deployment smoke verification", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-deploy-"));
  deploymentArtifacts(root, {
    project: { artifactId: "customer-api" },
    deployment: { target: "cloudhub2" }
  }, { artifactId: "customer-api", java: "17" });
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-cloudhub2.yml"), "utf8");
  assert.match(workflow, /MULEFORGE_SMOKE_URL/);
  assert.match(workflow, /Post-deployment smoke verification/);
  assert.match(workflow, /--fail-with-body/);
  const rtf = fs.readFileSync(path.join(root, ".github/workflows/deploy-rtf.yml"), "utf8");
  assert.doesNotMatch(rtf, /\\n/);
});
