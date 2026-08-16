const http = require("http");
const fs = require("fs");
const path = require("path");

function startUi(port = Number(process.env.MULEFORGE_UI_PORT || 4173)) {
  const file = path.resolve(__dirname, "../web/index.html");
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(file));
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
