const fs = require("fs");
const path = require("path");

const SUPPORTED_JAVA = new Set(["17","21"]);
const SUPPORTED_MULE = /^4\.(?:[6-9]|10)(?:\.|$)/;

function checkRuntimeCompatibility(model = {}, directory = ".") {
  const project = model.project || {};
  const java = String(project.java || "");
  const mule = String(project.muleRuntime || "");
  const findings = [];

  const add = (severity, code, message) => findings.push({ severity, code, message });

  if (!java) add("error", "JAVA_MISSING", "project.java must be declared.");
  else if (!SUPPORTED_JAVA.has(java)) add("warning", "JAVA_UNVERIFIED", `Java ${java} is outside MuleForge's built-in compatibility matrix; verify it against the target Mule runtime.`);

  if (!mule) add("error", "MULE_RUNTIME_MISSING", "project.muleRuntime must be declared.");
  else if (!SUPPORTED_MULE.test(mule)) add("warning", "MULE_RUNTIME_UNVERIFIED", `Mule runtime ${mule} is outside the built-in validation range; verify the target runtime before deployment.`);

  if (java === "21" && mule && !/^4\.(?:6|7|8|9|10)(?:\.|$)/.test(mule)) {
    add("warning", "JAVA_RUNTIME_COMBINATION", "Java 21 requires explicit confirmation of compatibility with the selected Mule runtime.");
  }

  const root = path.resolve(directory);
  const pom = path.join(root, "pom.xml");
  if (fs.existsSync(pom)) {
    const xml = fs.readFileSync(pom, "utf8");
    if (java && !xml.includes(java)) add("warning", "JAVA_POM_MISMATCH", `Configured Java ${java} was not found in pom.xml; review build configuration.`);
    if (mule && !xml.includes(mule)) add("warning", "MULE_POM_MISMATCH", `Configured Mule runtime ${mule} was not found in pom.xml; review runtime configuration.`);
    const plugin = xml.match(/<artifactId>mule-maven-plugin<\\/artifactId>[\\s\\S]*?<version>([^<]+)<\\/version>/i);
    if (plugin) findings.push({ severity: "info", code: "MULE_MAVEN_PLUGIN_DETECTED", message: `Mule Maven Plugin ${plugin[1].trim()} detected in pom.xml.` });
  }

  const errors = findings.filter(f => f.severity === "error");
  return { valid: errors.length === 0, java, muleRuntime: mule, findings };
}

module.exports = { checkRuntimeCompatibility };