const fs = require("fs");
const path = require("path");
function safe(value) { return String(value || "mule-api").replace(/[^A-Za-z0-9_.-]/g, "-"); }
function fieldName(field) { return typeof field === "string" ? field : field && (field.name || field.field); }
function exampleValue(field) {
  const name = String(fieldName(field) || "").toLowerCase();
  const type = String(field && field.type || "string").toLowerCase();
  if (type === "integer" || type === "number") return 1;
  if (type === "boolean") return true;
  if (type === "array") return [];
  if (type === "object") return {};
  if (name.includes("email")) return "customer@example.com";
  if (name.includes("phone") || name.includes("mobile")) return "9999999999";
  if (name.includes("date")) return "2026-01-01";
  if (name.endsWith("id") || name === "id") return "ID-001";
  return "string";
}
function requestBody(op) {
  const fields = Array.isArray(op.requestFields) ? op.requestFields : [];
  if (!["POST", "PUT", "PATCH"].includes(String(op.method || "GET").toUpperCase()) || !fields.length) return null;
  return JSON.stringify(Object.fromEntries(fields.map(f => [fieldName(f), exampleValue(f)]).filter(([k]) => k)));
}
function batTest(op, data) {
  const method = String(op.method || "GET").toUpperCase();
  const url = "$(config.baseUrl)" + (data.basePath || "/api/v1") + (op.path || "/");
  const headers = ["Content-Type: 'application/json'"];
  if (op.security === "client-id") headers.push("client_id: $(config.clientId)");
  if (op.security === "oauth2") headers.push("Authorization: 'Bearer ' ++ $(config.accessToken)");
  const body = requestBody(op);
  const withBlock = body ? "{ headers: { " + headers.join(", ") + " }, body: " + body + " }" : "{ headers: { " + headers.join(", ") + " } }";
  const status = Number(op.successStatus || (method === "POST" ? 201 : 200));
  const name = String(op.name || method + " " + op.path).replace(/"/g, "\\\"");
  return [
    "      it should §return " + status + " for " + name + "§ in [",
    "        " + method + " §" + url + "§ with " + withBlock + " assert [",
    "          $.response.status mustEqual " + status,
    "        ]",
    "      ]"
  ].join("\n");
}
function generateFunctionalMonitoringSuite(config = {}, data = {}) {
  const operations = Array.isArray(config.operations) ? config.operations : [];
  return [
    "import * from bat::BDD",
    "import * from bat::Assertions",
    "---",
    "describe §MuleForge functional smoke tests§ in [",
    operations.map(op => batTest(op, data)).join(",\n"),
    "]",
    ""
  ].join("\n").replace(/§/g, String.fromCharCode(96));
}
function generateBatManifest(artifact) {
  return [
    "suite:",
    "  name: \"" + artifact + " Functional Monitoring\"",
    "files:",
    "  - file: tests/" + artifact + ".dwl",
    "reporters:",
    "  - type: JSON",
    "    outFile: reports/result.json",
    "  - type: HTML",
    "    outFile: reports/result.html",
    "  - type: JUnit",
    "    outFile: reports/result.xml",
    ""
  ].join("\\n");
}

function generateBatConfig() {
  return JSON.stringify({
    baseUrl: "$(MULEFORGE_SMOKE_URL)",
    clientId: "$(MULEFORGE_CLIENT_ID)",
    accessToken: "$(MULEFORGE_ACCESS_TOKEN)"
  }, null, 2) + "\n";
}

/*
function legacyBatConfig() {
  return [
    "# MuleForge API Functional Monitoring configuration",
    "# Supply the deployed endpoint through the BAT environment/profile; never commit credentials.",
    "baseUrl: p(\"MULEFORGE_SMOKE_URL\")",
    "clientId: p(\"MULEFORGE_CLIENT_ID\")",
    "accessToken: p(\"MULEFORGE_ACCESS_TOKEN\")",
    ""
  ].join("\n");
}
function writeFunctionalMonitoring(root, config, data) {
  if (data.workloadType !== "api" || !Array.isArray(config.operations) || !config.operations.length) return null;
  const dir = path.join(root, "functional-monitoring");
  const testDir = path.join(dir, "tests");
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(dir, "reports"), { recursive: true });
  const artifact = safe(data.artifactId);
  fs.writeFileSync(path.join(testDir, artifact + ".dwl"), generateFunctionalMonitoringSuite(config, data), "utf8");
  fs.writeFileSync(path.join(dir, "bat.yaml"), generateBatManifest(artifact), "utf8");
  fs.mkdirSync(path.join(dir, "config"), { recursive: true });
  fs.writeFileSync(path.join(dir, "config", "dev-environment.dwl"), generateBatConfig(), "utf8");
  fs.writeFileSync(path.join(dir, "README.md"), "# API Functional Monitoring\n\nGenerated from the confirmed MuleForge API contract.\n\nThe .dwl suite provides black-box smoke tests for every confirmed API operation using the documented success status and request contract. Point it at a deployed environment before execution.\n\nMuleForge does not claim live runtime verification until these tests actually execute against the deployed API.\n", "utf8");
  return { directory: "functional-monitoring", manifest: "functional-monitoring/bat.yaml", suite: "functional-monitoring/tests/" + artifact + ".dwl" };
}
module.exports = { generateFunctionalMonitoringSuite, generateBatManifest, generateBatConfig, writeFunctionalMonitoring };
