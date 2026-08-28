const http = require("http");
const fs = require("fs");
const path = require("path");
const { readRequirementDocument, analyzeRequirementDocument } = require("./document-analyzer");
const { generateUiAssets } = require("./ui-generator");

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

          // UI generation is deliberately in-memory. Nothing is written to the
          // user's repository and no backend credentials or external services are used.
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
          return json(res, 200, { ok: true, ...assets });
        } catch (error) {
          return json(res, 400, { error: error.message });
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
