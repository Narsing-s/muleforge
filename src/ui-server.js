const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

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
      req.on("data", chunk => { body += chunk; if (body.length > 2_000_000) req.destroy(); });
      req.on("end", () => {
        try {
          const input = JSON.parse(body || "{}");
          const text = String(input.text || "").trim();
          const filename = path.basename(String(input.filename || "requirement.txt"));
          if (!text) return json(res, 400, { error: "Requirement document is empty." });
          const temp = path.join(process.cwd(), `.muleforge-upload-${Date.now()}-${filename.replace(/[^A-Za-z0-9_.-]/g, "-")}`);
          fs.writeFileSync(temp, text, "utf8");
          execFile(process.execPath, [path.resolve(__dirname, "index.js"), "analyze", temp, input.projectName || ""], { cwd: process.cwd() }, (error, stdout, stderr) => {
            try { fs.unlinkSync(temp); } catch {}
            if (error) return json(res, 400, { error: (stderr || stdout || error.message).trim() });
            return json(res, 200, { ok: true, output: stdout.trim() });
          });
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
