const http = require("http");
const fs = require("fs");
const path = require("path");
const { readRequirementDocument, analyzeRequirementDocument } = require("./document-analyzer");
const { generateUiAssets } = require("./ui-generator");
const { prepareAndSave } = require("./local-export");

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function startUi(port = Number(process.env.MULEFORGE_UI_PORT || 4173)) {
  const file = path.resolve(__dirname, "../web/index.html");
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(file));
    }

    if (req.method === "POST" && req.url === "/api/analyze") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", chunk => {
        body += chunk;
        if (body.length > 2_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          const input = JSON.parse(body || "{}");
          const text = String(input.text || "").trim();
          const filename = path.basename(String(input.filename || "requirement.txt"));
          if (!text) return json(res, 400, { error: "Requirement document is empty." });

          const model = analyzeRequirementDocument(text, filename);
          if (input.projectName) {
            const project = String(input.projectName).trim().replace(/[^A-Za-z0-9._-]/g, "-");
            if (project) {
              model.project.name = project;
              model.project.artifactId = project;
              model.api.name = project;
            }
          }
          const assets = generateUiAssets(model);
          return json(res, 200, { ok: true, ...assets, model });
        } catch (error) {
          return json(res, 400, { error: error.message });
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/save") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", chunk => {
        body += chunk;
        if (body.length > 5_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          const input = JSON.parse(body || "{}");
          if (!input.model || typeof input.model !== "object") {
            return json(res, 400, { error: "Analyze the requirement before saving." });
          }
          const result = prepareAndSave(input.model);
          return json(res, 200, {
            ok: true,
            ...result,
            message: `Workflow passed. Saved ${result.projectName} to the Desktop.`
          });
        } catch (error) {
          return json(res, 422, {
            ok: false,
            saved: false,
            error: error.message,
            message: "Generation/build workflow failed. Nothing was saved to the Desktop."
          });
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`\n⚡ MuleForge UI: http://127.0.0.1:${port}`);
    console.log("Press Ctrl+C to stop.\n");
  });
  return server;
}

module.exports = { startUi };
