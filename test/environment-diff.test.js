const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { environmentDiff } = require("../src/environment-diff");

test("environment diff detects and redacts sensitive changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-env-"));
  try {
    const a = path.join(dir, "a.yaml"), b = path.join(dir, "b.yaml");
    const devPassword = "<ENV_DB_PASSWORD_DEV>";
    const qaPassword = "<ENV_DB_PASSWORD_QA>";
    fs.writeFileSync(a, `db:\n  password: ${devPassword}\n  host: dev\n`);
    fs.writeFileSync(b, `db:\n  password: ${qaPassword}\n  host: qa\n`);
    const r = environmentDiff(a, b);
    assert.equal(r.changed, true);
    const password = r.changes.find(x => x.key === "db.password");
    assert.equal(password.from, "[REDACTED]");
    assert.equal(password.to, "[REDACTED]");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});