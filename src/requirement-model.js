const fs = require("fs");
const path = require("path");

function slug(value) { return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"; }
function parseEndpoints(text) { const found = []; const re = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s,.;]+)/gi; let match; while ((match = re.exec(text))) found.push({ method: match[1].toUpperCase(), path: match[2] }); return found; }
function inferConnectors(text) { const lower = text.toLowerCase(); const connectors = ["http"]; if (/snowflake/.test(lower)) connectors.push("snowflake"); if (/\b(database|mysql|postgres|postgresql|oracle)\b/.test(lower)) connectors.push("database"); if (/\b(sftp|file transfer)\b/.test(lower)) connectors.push("sftp"); if (/ibm\s*mq|queue manager/.test(lower)) connectors.push("ibm-mq"); if (/anypoint\s*mq/.test(lower)) connectors.push("anypoint-mq"); if (/object\s*store|objectstore|cache/.test(lower)) connectors.push("object-store"); return [...new Set(connectors)]; }
function inferFields(text) { const match = text.match(/(?:accept|fields?|parameters?)\s*[:\-]?\s*([^.!?\n]+)/i); if (!match) return []; return match[1].split(/,|\band\b/i).map(v => v.trim().replace(/[^A-Za-z0-9_]/g, "")).filter(Boolean); }
function parseRequirementItems(text) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const items = [];
  let sequence = 0;
  const push = (value, line, kind) => {
    const normalized = String(value || "").replace(/^[-*+\d.)]+\s+/, "").replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length < 8) return;
    if (/^(requirement|requirements|overview|introduction|scope|background|notes?)\s*:?[\s-]*$/i.test(normalized)) return;
    const duplicate = items.some(item => item.text.toLowerCase() === normalized.toLowerCase());
    if (duplicate) return;
    sequence += 1;
    items.push({
      id: "REQ-" + String(sequence).padStart(3, "0"),
      text: normalized,
      source: "requirement:line:" + line,
      kind
    });
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^#{1,6}\s+/.test(trimmed)) push(trimmed.replace(/^#{1,6}\s+/, ""), index + 1, "heading");
    else if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) push(trimmed, index + 1, "list-item");
    else {
      const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(x => x.trim()).filter(Boolean);
      sentences.forEach(sentence => push(sentence, index + 1, "statement"));
    }
  });
  return items;
}

function isBodyOperation(method) { return ["POST", "PUT", "PATCH"].includes(String(method || "").toUpperCase()); }
function inferApiSpecification(text, answers = {}) {
  const explicit = String(answers.apiSpecification || answers.specification || answers.api?.specification || "").trim().toUpperCase();
  if (explicit) return explicit === "OPENAPI" ? "OAS" : explicit;
  const value = String(text || "").toLowerCase();
  if (/\\basyncapi\\b/.test(value)) return "AsyncAPI";
  if (/\\bgrpc\\b|protocol buffers?/.test(value)) return "Protobuf";
  if (/\\bgraphql\\b/.test(value)) return "GraphQL";
  if (/\\bodata\\b/.test(value)) return "OData";
  if (/\\bsoap\\b|\\bwsdl\\b/.test(value)) return "WSDL";
  if (/\\bopenapi\\b|\\boas\\b/.test(value)) return "OAS";
  return "RAML";
}
function buildRequirementModel(requirement, answers = {}) {
  const text = String(requirement || "").trim();
  if (!text) throw new Error("A requirement is required");
  const endpoints = answers.operations || parseEndpoints(text);
  const inferredFields = inferFields(text);
  const connectors = answers.connectors || inferConnectors(text);
  const backendConnectors = connectors.filter(c => String(c).toLowerCase() !== "http");
  return {
    requirement: text,
    requirements: parseRequirementItems(text),
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
      specification: inferApiSpecification(text, answers),
      basePath: answers.basePath || "/api/v1"
    },
    connectors,
    operations: endpoints.map((endpoint, index) => {
      const method = String(endpoint.method || "").toUpperCase();
      const requestFields = Array.isArray(endpoint.requestFields) && endpoint.requestFields.length
        ? endpoint.requestFields
        : (isBodyOperation(method) ? (answers.requestFields?.length ? answers.requestFields : inferredFields) : []);
      const responseFields = Array.isArray(endpoint.responseFields) && endpoint.responseFields.length
        ? endpoint.responseFields
        : (answers.responseFields?.length ? answers.responseFields : []);
      const validation = Array.isArray(endpoint.validation) && endpoint.validation.length
        ? endpoint.validation
        : (answers.validation?.length ? answers.validation : []);
      const errors = Array.isArray(endpoint.errors) && endpoint.errors.length
        ? endpoint.errors
        : (answers.errors?.length ? answers.errors : []);
      const connector = endpoint.connector || (backendConnectors.length === 1 ? backendConnectors[0] : undefined);
      return {
        name: endpoint.name || `${method.toLowerCase()}${slug(endpoint.path).replace(/-/g, "_") || index}`,
        method,
        path: endpoint.path,
        ...(connector ? { connector } : {}),
        requestFields,
        responseFields,
        validation,
        successStatus: endpoint.successStatus || (method === "POST" ? 201 : 200),
        errors,
        ...(backendConnectors.length > 1 && !endpoint.connector ? { connectorAmbiguous: true } : {})
      };
    }),
    decisions: answers.decisions || [],
    testing: { munit: answers.munit !== false },
    deployment: { target: answers.deployment || "none" }
  };
}
function missingQuestions(model) { const questions = []; if (!model.operations.length) questions.push({ key: "operations", question: "Which HTTP operations and paths are required? Example: POST /customers, GET /customers/{customerId}" }); if (model.operations.some(op => isBodyOperation(op.method) && !op.requestFields.length)) questions.push({ key: "requestFields", question: "What request fields are required for each operation?" }); if (model.operations.some(op => !op.responseFields.length)) questions.push({ key: "responseFields", question: "What should the successful response contain?" }); if (model.operations.some(op => !op.validation.length)) questions.push({ key: "validation", question: "What validation rules should be enforced?" }); if (model.operations.some(op => !op.errors.length)) questions.push({ key: "errors", question: "Which business and error cases should be handled?" }); if (model.connectors.length === 1) questions.push({ key: "backend", question: "Which backend systems or connectors are required?" }); return questions; }
function scenarioText(model) { const rows = []; for (const op of model.operations) { rows.push(`### ${op.method} ${op.path} — happy path\n\n- Given a valid request\n- When the operation is invoked\n- Then return HTTP ${op.successStatus}`); for (const validation of op.validation || []) rows.push(`### ${op.method} ${op.path} — validation: ${validation}\n\n- Given the request violates the rule\n- When the operation is invoked\n- Then return HTTP 400`); for (const error of op.errors || []) rows.push(`### ${op.method} ${op.path} — ${error}\n\n- Given the described business or dependency condition\n- When the operation is invoked\n- Then return the documented error status and response`); } return rows.join("\n\n") || "No scenarios could be derived."; }
function writeDocumentation(root, model) {
  const docs = path.join(root, "docs");
  const operations = Array.isArray(model.operations) ? model.operations : [];
  const connectors = Array.isArray(model.connectors) ? model.connectors : [];
  const decisions = Array.isArray(model.decisions) ? model.decisions : [];
  const project = model.project || {};
  const api = model.api || {};
  const testing = model.testing || {};
  const deployment = model.deployment || {};
  const artifactName = project.name || project.artifactId || "mule-api";
  const runtime = project.muleRuntime || "4.9.0";
  const java = project.java || "17";
  const endpointText = operations.length ? operations.map(op => `- **${op.method || "UNKNOWN"} ${op.path || "/"}** — ${op.name || "unnamed operation"}`).join("\n") : "- No operations confirmed.";
  ["00-solution-design", "01-requirements", "02-architecture", "03-api", "04-database", "05-dataweave", "06-flows", "07-configuration", "08-testing", "09-deployment", "10-troubleshooting"].forEach(dir => fs.mkdirSync(path.join(docs, dir), { recursive: true }));
  fs.writeFileSync(path.join(docs, "README.md"), `# ${artifactName} Documentation

Generated from the confirmed MuleForge requirement.

- [Solution Design](00-solution-design/solution-design.md)
- [Requirements](01-requirements/requirements.md)
- [Architecture](02-architecture/architecture.md)
- [API](03-api/api-overview.md)
- [Flows](06-flows/main-flow.md)
- [Testing](08-testing/testing.md)
- [Test Scenarios](08-testing/test-scenarios.md)
- [Deployment](09-deployment/deployment.md)
`);
  fs.writeFileSync(path.join(docs, "00-solution-design/solution-design.md"), `# Solution Design

## Confirmed requirement

${model.requirement || "No requirement text was supplied."}

## API operations
${endpointText}

## Connectors inferred from the requirement
${connectors.map(c => `- ${c}`).join("\n") || "- None confirmed."}

> MuleForge does not ask for backend credentials or environment connection details during requirement analysis.
`);
  fs.writeFileSync(path.join(docs, "01-requirements/requirements.md"), `# Requirements

${model.requirement || "No requirement text was supplied."}

## Decisions
${decisions.map(d => `- ${d}`).join("\n") || "- None recorded."}
`);
  fs.writeFileSync(path.join(docs, "02-architecture/architecture.md"), `# Architecture

Client → HTTP Listener → Validation → Business Flow → Connector/Backend (if required) → DataWeave → Response
`);
  fs.writeFileSync(path.join(docs, "03-api/api-overview.md"), `# API

Base path: \`${api.basePath || "/"}\`

${endpointText}
`);
  fs.writeFileSync(path.join(docs, "04-database/database-design.md"), `# Database Design

Backend connection details are intentionally not required for requirement-driven generation. If a database is mentioned, MuleForge generates connector/configuration placeholders only.
`);
  fs.writeFileSync(path.join(docs, "05-dataweave/transformations.md"), `# DataWeave

Request and response mappings are generated from the confirmed requirement model.
`);
  fs.writeFileSync(path.join(docs, "06-flows/main-flow.md"), `# End-to-End Flow Documentation

${operations.map(op => `## ${op.name || "Unnamed operation"}

**${op.method || "UNKNOWN"} ${op.path || "/"}**

1. Receive request through HTTP Listener
2. Validate the request according to the requirement
3. Execute the confirmed business logic
4. Call only connectors inferred from the requirement
5. Transform the response with DataWeave
6. Return HTTP ${op.successStatus || 200} on success
7. Route documented business, validation, dependency and unexpected errors to the generated error handler
`).join("\n") || "No flow is generated until an operation is confirmed."}`);
  fs.writeFileSync(path.join(docs, "07-configuration/configuration.md"), `# Configuration

Runtime: ${runtime}
Java: ${java}

Secrets and environment-specific values are represented by properties and must not be committed.
`);
  fs.writeFileSync(path.join(docs, "08-testing/testing.md"), `# Testing

MUnit enabled: ${testing.munit === false ? "no" : "yes"}.

The generated suite covers happy paths, validation rules, business errors and dependency failures inferred from the requirement.
`);
  fs.writeFileSync(path.join(docs, "08-testing/test-scenarios.md"), `# Test Scenarios

${scenarioText({ ...model, operations })}
`);
  fs.writeFileSync(path.join(docs, "09-deployment/deployment.md"), `# Deployment

Target: ${deployment.target || "none"}

Deployment credentials and environment connection details are intentionally not requested by the analyzer.
`);
  fs.writeFileSync(path.join(docs, "10-troubleshooting/troubleshooting.md"), `# Troubleshooting

Run \`muleforge validate\`, then \`muleforge verify --build\`. Review the generated RAML, Mule XML, MUnit scenarios and Postman collection.
`);
}
module.exports = { buildRequirementModel, missingQuestions, writeDocumentation, isBodyOperation };
