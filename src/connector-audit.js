const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { resolveConnectors } = require("./connectors");

const REQUIREMENTS = {
  http: { namespace: "http", dependency: "mule-http-connector", config: /<http:listener-config\b/, operation: /<http:listener\b/ },
  database: { namespace: "db", dependency: "mule-db-connector", config: /<db:config\b/, operation: /<db:(select|insert)\b/ },
  snowflake: { namespace: "snowflake", dependency: "mule4-snowflake-connector", config: /<snowflake:snowflake-config\b/, operation: /<snowflake:(select|insert)\b/ },
  sftp: { namespace: "sftp", dependency: "mule-sftp-connector", config: /<sftp:config\b/, operation: /<sftp:(read|write|list)\b/ },
  "ibm-mq": { namespace: "ibm-mq", dependency: "mule-ibm-mq-connector", config: /<ibm-mq:config\b/, operation: /<ibm-mq:publish\b/ },
  "anypoint-mq": { namespace: "anypoint-mq", dependency: "mule-anypoint-mq-connector", config: /<anypoint-mq:config\b/, operation: /<anypoint-mq:publish\b/ },
  "object-store": { namespace: "os", dependency: null, config: /<os:(object-store|store)\b/, operation: /<os:store\b/ },
  file: { namespace: "file", dependency: "mule-file-connector", config: /<file:config\b/, operation: /<file:(read|write)\b/ },
  email: { namespace: "email", dependency: "mule-email-connector", config: /<email:smtp-config\b/, operation: /<email:send\b/ },
  jms: { namespace: "jms", dependency: "mule-jms-connector", config: /<jms:config\b/, operation: /<jms:publish\b/ },
  kafka: { namespace: "kafka", dependency: "mule-kafka-connector", config: /<kafka:producer-config\b/, operation: /<kafka:publish\b/ },
  salesforce: { namespace: "sfdc", dependency: "mule-sfdc-connector", config: /<sfdc:sfdc-config\b/, operation: /<sfdc:(query|create)\b/ }
};

function auditConnectors(file = "muleforge.yaml") {
  const absolute = path.resolve(file);
  const root = path.dirname(absolute);
  const config = YAML.parse(fs.readFileSync(absolute, "utf8")) || {};
  const pom = fs.existsSync(path.join(root, "pom.xml")) ? fs.readFileSync(path.join(root, "pom.xml"), "utf8") : "";
  const muleDir = path.join(root, "src", "main", "mule");
  const mule = fs.existsSync(muleDir)
    ? fs.readdirSync(muleDir).filter(f => f.endsWith(".xml")).map(f => fs.readFileSync(path.join(muleDir, f), "utf8")).join("\n")
    : "";
  const requested = [...new Set([...(config.connectors || []), ...(config.operations || []).map(o => o.connector).filter(Boolean)])];
  const connectors = resolveConnectors(requested);
  const checks = [];
  for (const c of connectors) {
    const req = REQUIREMENTS[c.id];
    if (!req) { checks.push({ connector: c.id, pass: false, detail: "No connector integrity rule is registered." }); continue; }
    const namespacePresent = c.id === "http" ? /xmlns:http=/.test(mule) : new RegExp("xmlns:" + req.namespace + "=").test(mule);
    const dependencyPresent = !req.dependency || pom.includes(req.dependency);
    const configPresent = req.config.test(mule);
    const operationPresent = req.operation.test(mule);
    checks.push({ connector: c.id, pass: namespacePresent && dependencyPresent && configPresent && operationPresent, namespacePresent, dependencyPresent, configPresent, operationPresent });
  }
  return { ready: checks.every(c => c.pass), checks };
}
module.exports = { auditConnectors, REQUIREMENTS };
