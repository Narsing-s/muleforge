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
  assert.equal(model.connectivity.find(x => x.type === "sftp").path, "/inbound/customer");
  assert.equal(model.connectivity.find(x => x.type === "sftp").schedule, "15 minutes");
  assert.equal(model.operations[0].downstreamEndpoint, "https://customer.example.com/v1/customers");
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
  const found = inferConnectivity("Publish to IBM MQ host mq.example.com port 1414 queue manager QM1 channel DEV.ADMIN.SVRCONN queue CUSTOMER.IN and authenticate with client credentials.", "mq.md");
  assert.equal(found[0].type, "ibm-mq");
  assert.equal(found[0].queue, "CUSTOMER.IN");
  assert.equal(found[0].auth, "client-credentials");
  assert.equal(found[0].queueManager, "QM1");
  assert.equal(found[0].channel, "DEV.ADMIN.SVRCONN");
});

test("preserves explicit Anypoint MQ endpoint and destination", () => {
  const found = inferConnectivity("Publish to Anypoint MQ endpoint https://mq.example.com/api/v1 destination CUSTOMER.OUT.", "mq.md");
  assert.equal(found[0].endpoint, "https://mq.example.com/api/v1");
  assert.equal(found[0].queue, "CUSTOMER.OUT");
});


test("does not silently map multiple connectors to an unrelated operation", () => {
  const docs = [
    { name: "api.md", type: "md", text: "POST /customers creates a customer." },
    { name: "integration.md", type: "md", text: "The integration also uses SFTP host files.example.com path /inbound and publishes to IBM MQ queue CUSTOMER.IN." }
  ];
  const model = analyzeRequirementDocument(docs.map(x => x.text).join("\n"), "api.md", docs);
  assert.equal(model.operations[0].connector, null);
  assert.equal(model.operations[0].connectorAmbiguous, true);
  assert.ok(model.conflicts.some(x => x.type === "operation-connector"));
});

test("maps a single explicit connector without inventing a second connector", () => {
  const text = "POST /customers receives a request and publishes it to IBM MQ queue CUSTOMER.IN on queue manager QM1 channel DEV.ADMIN.SVRCONN.";
  const model = analyzeRequirementDocument(text, "mq.md");
  assert.equal(model.operations[0].connector, "ibm-mq");
  assert.equal(model.operations[0].destination, "CUSTOMER.IN");
});

test("does not silently assign multiple connectors to an operation", () => {
  const model = analyzeRequirementDocument(
    "POST /process. Integrate with SFTP and IBM MQ. SFTP host sftp.example.com path /inbound. IBM MQ host mq.example.com queue CUSTOMER.IN.",
    "mixed.md"
  );
  assert.ok(model.conflicts.some(x => x.type === "operation-routing" && x.resolutionRequired === true));
});

test("keeps connector and downstream evidence scoped to each operation", () => {
  const docs = [
    {
      name: "integration.md",
      type: "md",
      text: [
        "POST /files Process files using SFTP host sftp.example.com path /inbound.",
        "Send files to https://files.example.com/v1/import.",
        "POST /messages Publish messages to IBM MQ host mq.example.com queue CUSTOMER.OUT.",
        "Send messages to https://messages.example.com/v1/publish."
      ].join("\n")
    }
  ];
  const model = analyzeRequirementDocument(docs[0].text, docs[0].name, docs);
  assert.equal(model.operations.length, 2);
  assert.equal(model.operations[0].connector, "sftp");
  assert.equal(model.operations[0].downstreamEndpoint, "https://files.example.com/v1/import");
  assert.equal(model.operations[1].connector, "ibm-mq");
  assert.equal(model.operations[1].destination, "CUSTOMER.OUT");
  assert.equal(model.operations[1].downstreamEndpoint, "https://messages.example.com/v1/publish");
});
