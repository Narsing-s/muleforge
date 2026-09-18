const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("runtime-check command is documented in CLI source", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /runtime-check \[directory\]/);
  assert.match(source, /Maven repository access and credentials/);
});

test("generated POM uses a Mule Maven plugin that supports runtimeVersion", () => {
  const pom = fs.readFileSync(path.resolve(__dirname, "../templates/pom.xml.hbs"), "utf8");
  assert.match(pom, /<mule.maven.plugin.version>4\.10\.1<\/mule\.maven.plugin.version>/);
});
