const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeRequirementDocument, inferConnectivity } = require("../src/document-analyzer");

test("follows explicit SFTP, schedule and downstream API details", () => {
  const text = [
    "# Customer File Integration",
    "Receive customer files from SFTP host sftp.example.com port 22 path /inbound/customer.",
    "Process every 15 minutes.",
    "Transform CSV to JSON and send to Customer REST API https://customer.example.com/v1/customers.",
    "Archive successful files to /archive and failures to /error."
  ].join("\n");
  const model = analyzeRequirementDocument(text, "requirements.txt");
  assert.equal(model.connectivity.find(x => x.type === "sftp").host, "sftp.example.com");
  assert.equal(model.connectivity.find(x => x.type === "sftp").path, "/inbound/customer.");
  assert.equal(model.connectivity.find(x => x.type === "sftp").schedule, "15 minutes");
  assert.equal(model.operations[0].downstreamEndpoint, "https://customer.example.com/v1/customers.");
});

test("surfaces conflicting explicit connectivity across documents", () => {
  const docs = [
    { name: "a.md", type: "md", text: "Use SFTP host sftp-a.example.com path /inbound." },
    { name: "b.md", type: "md", text: "Use SFTP host sftp-b.example.com path /inbound." }
  ];
  const model = analyzeRequirementDocument(docs.map(x => x.text).join("\n"), "a.md", docs);
  assert.ok(model.conflicts.length > 0);
  assert.equal(model.conflicts[0].resolutionRequired, true);
});

test("connector detection is explicit rather than default-only", () => {
  const found = inferConnectivity("Publish to IBM MQ queue CUSTOMER.IN and authenticate with client credentials.", "mq.md");
  assert.equal(found[0].type, "ibm-mq");
  assert.equal(found[0].queue, "CUSTOMER.IN");
  assert.equal(found[0].auth, "client-credentials");
});
