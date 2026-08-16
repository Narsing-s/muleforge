const fs = require("fs");
const path = require("path");

function slug(value) {
  return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function parseEndpoints(text) {
  const found = [];
  const re = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s,.;]+)/gi;
  let match;
  while ((match = re.exec(text))) found.push({ method: match[1].toUpperCase(), path: match[2] });
  return found;
}

function inferConnectors(text) {
  const lower = text.toLowerCase();
  const connectors = ["http"];
  if (/snowflake/.test(lower)) connectors.push("snowflake");
  if (/\b(database|mysql|postgres|postgresql|oracle)\b/.test(lower)) connectors.push("database");
  if (/\b(sftp|file transfer)\b/.test(lower)) connectors.push("sftp");
  if (/ibm\s*mq|queue manager/.test(lower)) connectors.push("ibm-mq");
  if (/anypoint\s*mq|message queue/.test(lower)) connectors.push("anypoint-mq");
  if (/object\s*store|objectstore|cache/.test(lower)) connectors.push("object-store");
  return [...new Set(connectors)];
}

function inferFields(text) {
  const match = text.match(/(?:accept|fields?|parameters?)\s*[:\-]?\s*([^.!?\n]+)/i);
  if (!match) return [];
  return match[1].split(/,|\band\b/i).map(v => v.trim().replace(/[^A-Za-z0-9_]/g, "")).filter(Boolean);
}

function buildRequirementModel(requirement, answers = {}) {
  const text = String(requirement || "").trim();
  if (!text) throw new Error("A requirement is required");
  const endpoints = answers.operations || parseEndpoints(text);
  const inferredFields = inferFields(text);
  return {
    requirement: text,
    project: {
      name: slug(answers.projectName || "mule-api"),
      artifactId: slug(answers.projectName || "mule-api"),
      groupId: answers.groupId || "com.example",
      version: "1.0.0",
      muleRuntime: answers.muleRuntime || "4.9.0",
      java: answers.java || "17"
    },
    api: {
      name: answers.apiName || slug(answers.projectName || "mule-api"),
      version: answers.apiVersion || "v1",
      type: answers.apiType || "System API",
      specification: "RAML",
      basePath: answers.basePath || "/api/v1"
    },
    connectors: answers.connectors || inferConnectors(text),
    operations: endpoints.map((endpoint, index) => ({
      name: endpoint.name || `${endpoint.method.toLowerCase()}${slug(endpoint.path).replace(/-/g, "_") || index}`,
      method: endpoint.method,
      path: endpoint.path,
      requestFields: endpoint.requestFields || answers.requestFields || inferredFields,
      responseFields: endpoint.responseFields || answers.responseFields || [],
      validation: endpoint.validation || answers.validation || [],
      successStatus: endpoint.successStatus || (endpoint.method === "POST" ? 201 : 200),
      errors: endpoint.errors || answers.errors || []
    })),
    decisions: answers.decisions || [],
    testing: { munit: answers.munit !== false },
    deployment: { target: answers.deployment || "none" }
  };
}

function missingQuestions(model) {
  const questions = [];
  if (!model.operations.length) questions.push({ key: "operations", question: "Which HTTP operations and paths are required? Example: POST /customers, GET /customers/{customerId}" });
  if (model.operations.some(op => !op.requestFields.length)) questions.push({ key: "requestFields", question: "What request fields are required for each operation?" });
  if (model.operations.some(op => !op.responseFields.length)) questions.push({ key: "responseFields", question: "What should the successful response contain?" });
  if (model.operations.some(op => !op.validation.length)) questions.push({ key: "validation", question: "What validation rules should be enforced?" });
  if (model.operations.some(op => !op.errors.length)) questions.push({ key: "errors", question: "Which business and error cases should be handled?" });
  if (model.connectors.length === 1) questions.push({ key: "backend", question: "Which backend systems or connectors are required?" });
  return questions;
}

function writeDocumentation(root, model) {
  const docs = path.join(root, "docs");
  ["00-solution-design", "01-requirements", "02-architecture", "03-api", "04-database", "05-dataweave", "06-flows", "07-configuration", "08-testing", "09-deployment", "10-troubleshooting"].forEach(dir => fs.mkdirSync(path.join(docs, dir), { recursive: true }));
  const endpointText = model.operations.length ? model.operations.map(op => `- **${op.method} ${op.path}** — ${op.name}`).join("\n") : "- No operations confirmed.";
  fs.writeFileSync(path.join(docs, "README.md"), `# ${model.project.name} Documentation\n\nGenerated from the confirmed MuleForge requirement.\n\n- [Solution Design](00-solution-design/solution-design.md)\n- [Requirements](01-requirements/requirements.md)\n- [Architecture](02-architecture/architecture.md)\n- [API](03-api/api-overview.md)\n- [Flows](06-flows/main-flow.md)\n- [Testing](08-testing/testing.md)\n- [Deployment](09-deployment/deployment.md)\n`);
  fs.writeFileSync(path.join(docs, "00-solution-design/solution-design.md"), `# Solution Design\n\n## Confirmed requirement\n\n${model.requirement}\n\n## API operations\n${endpointText}\n\n## Connectors\n${model.connectors.map(c => `- ${c}`).join("\n") || "- None confirmed."}\n`);
  fs.writeFileSync(path.join(docs, "01-requirements/requirements.md"), `# Requirements\n\n${model.requirement}\n\n## Decisions\n${model.decisions.map(d => `- ${d}`).join("\n") || "- None recorded."}\n`);
  fs.writeFileSync(path.join(docs, "02-architecture/architecture.md"), `# Architecture\n\nClient → HTTP Listener → Validation → Business Flow → Connector/Backend → Response\n`);
  fs.writeFileSync(path.join(docs, "03-api/api-overview.md"), `# API\n\nBase path: \`${model.api.basePath}\`\n\n${endpointText}\n`);
  fs.writeFileSync(path.join(docs, "04-database/database-design.md"), `# Database Design\n\nConnectors: ${model.connectors.join(", ") || "None confirmed"}\n\nCredentials must use environment or secure properties.\n`);
  fs.writeFileSync(path.join(docs, "05-dataweave/transformations.md"), `# DataWeave\n\nTransformations are generated from confirmed request and response definitions.\n`);
  fs.writeFileSync(path.join(docs, "06-flows/main-flow.md"), `# Flows\n\n${model.operations.map(op => `## ${op.name}\n\n${op.method} ${op.path}\n\n1. Receive request\n2. Validate\n3. Execute confirmed business logic\n4. Transform response\n5. Return ${op.successStatus}\n`).join("\n") || "No flow is generated until an operation is confirmed."}`);
  fs.writeFileSync(path.join(docs, "07-configuration/configuration.md"), `# Configuration\n\nRuntime: ${model.project.muleRuntime}\nJava: ${model.project.java}\n\nNever commit secrets.\n`);
  fs.writeFileSync(path.join(docs, "08-testing/testing.md"), `# Testing\n\nMUnit enabled: ${model.testing.munit ? "yes" : "no"}.\n\nTests should cover success, validation, business errors and connector failures.\n`);
  fs.writeFileSync(path.join(docs, "09-deployment/deployment.md"), `# Deployment\n\nTarget: ${model.deployment.target}\n`);
  fs.writeFileSync(path.join(docs, "10-troubleshooting/troubleshooting.md"), `# Troubleshooting\n\nRun \`muleforge validate\`, then \`muleforge build\`.\n`);
}

module.exports = { buildRequirementModel, missingQuestions, writeDocumentation };
