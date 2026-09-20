const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyzeRequirementDocument, extractDocumentBuffer } = require("./document-analyzer");
const { generateUiAssets } = require("./ui-generator");
const { prepareAndSave } = require("./local-export");
const { version } = require("../package.json");
const { importProject } = require("./import-project");
const { buildEngineeringPlan, explainImportedProject, classifyWorkload } = require("./workload-engine");

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function readBody(req, limit = 30_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > limit) { req.destroy(); reject(new Error("Request is too large. Maximum upload package is 30 MB.")); }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
function safeDocumentName(value, fallback) {
  const raw = String(value || fallback || "requirement.txt").replace(/\\/g, "/");
  const parts = raw.split("/").filter(part => part && part !== "." && part !== "..");
  return parts.length ? parts.join("/") : String(fallback || "requirement.txt");
}
function normalizeDocuments(input) {
  if (Array.isArray(input.documents) && input.documents.length) {
    return input.documents.map((doc, i) => {
      const name = safeDocumentName(doc.name, "requirement-" + (i + 1) + ".txt");
      if (doc.text != null) return { name, type: path.extname(name).slice(1) || "txt", text: String(doc.text) };
      if (doc.base64) {
        const extracted = extractDocumentBuffer(Buffer.from(String(doc.base64), "base64"), name);
        return { name, type: extracted.type, text: extracted.text };
      }
      throw new Error("Document " + name + " has no text or file content.");
    });
  }
  const text = String(input.text || "").trim();
  if (!text) throw new Error("Requirement document is empty.");
  const filename = safeDocumentName(input.filename, "requirement.txt");
  return [{ name: filename, type: path.extname(filename).slice(1) || "txt", text }];
}
function writeRepositoryUpload(files) {
  const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "muleforge-repo-"));
  try {
    if (!Array.isArray(files) || !files.length) throw new Error("Select a complete Mule repository folder.");
    for (const [i, file] of files.entries()) {
      const name = safeDocumentName(file.name, "file-" + (i + 1));
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep)) throw new Error("Unsafe repository path.");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (file.base64) fs.writeFileSync(target, Buffer.from(String(file.base64), "base64"));
      else if (file.text != null) fs.writeFileSync(target, String(file.text), "utf8");
      else throw new Error("Repository file " + name + " has no content.");
    }
    const imported = importProject(root);
    const plan = explainImportedProject(imported);
    return { imported, plan };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function applyResolutions(model, resolutions = []) {
  if (!Array.isArray(resolutions) || !resolutions.length) return model;
  for (const resolution of resolutions) {
    if (!resolution || !resolution.type || !resolution.value) continue;
    if (resolution.type === "connectivity") {
      const items = (model.connectivity || []).filter(x => x.type === resolution.connector);
      for (const item of items) item[resolution.field] = resolution.value;
    }
    if (resolution.type === "operation-connector") {
      const op = (model.operations || []).find(x => (x.method + " " + x.path) === resolution.operation);
      if (op) {
        op.connector = resolution.value;
        op.connectorAmbiguous = false;
        op.resolution = "user-selected";
      }
    }
  }
  model.conflicts = (model.conflicts || []).filter(conflict => {
    if (conflict.type === "connectivity") {
      return (conflict.differences || []).some(diff => {
        const selected = resolutions.find(r => r.type === "connectivity" && r.connector === conflict.connector && r.field === diff.field);
        return !selected;
      });
    }
    if (conflict.type === "operation-connector") {
      return !resolutions.some(r => r.type === "operation-connector" && r.operation === conflict.operation);
    }
    return true;
  });
  const unresolvedOperationConflicts = (model.conflicts || []).filter(x => x.type === "operation-connector");
  model.missingConfigurations = (model.missingConfigurations || []).filter(x =>
    x.connector !== "ambiguous" || unresolvedOperationConflicts.length
  );
  model.decisions = [...(model.decisions || []), ...resolutions.map(r => "User-resolved " + r.type + " " + (r.connector || r.operation || "") + " " + (r.field || "") + " to " + r.value)];
  return model;
}

function validateSaveRequest(model, approved) {
  if (!approved || model?.approval?.approved !== true) throw new Error("User approval is required before generation can be saved.");
  if (!model || typeof model !== "object") throw new Error("Analyze the requirement before saving.");
  if (!String(model.requirement || "").trim()) throw new Error("A confirmed requirement is required before saving.");
  if (!model.project || !String(model.project.name || "").trim()) throw new Error("A project name is required before saving.");
  const workload = classifyWorkload({ model });
  if (workload.type === "unknown") throw new Error("MuleForge could not determine the workload type. Confirm the integration design before saving.");
  if (workload.apiContractRequired && (!Array.isArray(model.operations) || model.operations.length === 0)) throw new Error("At least one confirmed API operation is required before saving.");
  if (!workload.apiContractRequired && (!Array.isArray(model.operations) || model.operations.length === 0) && !((model.events || model.triggers || model.connectors || []).length)) throw new Error("A non-API workload needs a confirmed trigger, event, connector, or operation before saving.");
  if (Array.isArray(model.conflicts) && model.conflicts.length) throw new Error("Resolve all requirement conflicts before saving.");
  if (Array.isArray(model.missingConfigurations) && model.missingConfigurations.length) throw new Error("Resolve all required connectivity decisions before saving.");
  if (model.operations.some(op => op && op.connectorAmbiguous)) throw new Error("Resolve ambiguous operation connector mappings before saving.");
  return true;
}

function startUi(port = Number(process.env.PORT || process.env.MULEFORGE_UI_PORT || 4173)) {
  const file = path.resolve(__dirname, "../web/index.html");
  const hosted = Boolean(process.env.PORT);
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "muleforge", version, mode: hosted ? "hosted" : "local" });
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(file));
    }
    if (req.method === "POST" && req.url === "/api/analyze") {
      try {
        const input = JSON.parse(await readBody(req));
        const docs = normalizeDocuments(input);
        const model = applyResolutions(
          analyzeRequirementDocument(docs.map(d => d.text).join("\n\n"), docs[0].name, docs),
          input.resolutions
        );
        if (input.projectName) {
          const project = String(input.projectName).trim().replace(/[^A-Za-z0-9._-]/g, "-");
          if (project) { model.project.name = project; model.project.artifactId = project; model.api.name = project; }
        }
        const assets = generateUiAssets(model);
        const plan = buildEngineeringPlan(model);
        return json(res, 200, { ok: true, ...assets, model, plan });
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
    }
    if (req.method === "POST" && req.url === "/api/import") {
      try {
        const input = JSON.parse(await readBody(req));
        const result = writeRepositoryUpload(input.files);
        return json(res, 200, {
          ok: true,
          mode: "existing-repository",
          model: result.imported,
          plan: result.plan,
          message: "Repository analyzed read-only. Source assets were not modified."
        });
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
    }
    if (req.method === "POST" && req.url === "/api/save") {
      if (hosted) return json(res, 409, { ok: false, saved: false, error: "Desktop export is available only in MuleForge Local mode.", message: "The hosted server cannot write to a visitor's physical Desktop. Run MuleForge locally for direct Desktop export." });
      try {
        const input = JSON.parse(await readBody(req, 8_000_000));
        validateSaveRequest(input.model, input.approved === true);
        const result = prepareAndSave(input.model);
        return json(res, 200, { ok: true, ...result, message: "Workflow passed. Saved " + result.projectName + " to the Desktop." });
      } catch (error) {
        return json(res, 422, { ok: false, saved: false, error: error.message, message: "Generation/build workflow failed. Nothing was saved to the Desktop." });
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
  server.listen(port, hosted ? "0.0.0.0" : "127.0.0.1", () => {
    console.log("\\n⚡ MuleForge UI: http://127.0.0.1:" + port);
    console.log(hosted ? "Hosted mode: Desktop export is disabled." : "Local mode: Desktop export is available after all verification gates pass.");
  });
  return server;
}
module.exports = { startUi, validateSaveRequest };