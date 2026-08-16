const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("muleforge init generates a complete project skeleton", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-"));
  const cli = path.resolve(__dirname, "../src/index.js");
  execFileSync(process.execPath, [cli, "init", "customer-api"], { cwd: temp, stdio: "pipe" });
  const root = path.join(temp, "customer-api");
  for (const file of [
    "muleforge.yaml",
    "pom.xml",
    "mule-artifact.json",
    "src/main/resources/application.yaml",
    "src/main/resources/api/customer-api.raml",
    "src/main/mule/customer-api.xml",
    "src/test/munit/customer-api-test.xml"
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
  }
});
