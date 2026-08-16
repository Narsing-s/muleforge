const CONNECTORS = {
  http: {
    name: "HTTP",
    description: "HTTP Listener and Request",
    maven: null,
    namespace: "http"
  },
  database: {
    name: "Database",
    description: "Database connector",
    maven: "org.mule.connectors:mule-db-connector",
    namespace: "db"
  },
  snowflake: {
    name: "Snowflake",
    description: "Snowflake database connector",
    maven: "com.mulesoft.connectors:mule-snowflake-connector",
    namespace: "snowflake"
  },
  sftp: {
    name: "SFTP",
    description: "Secure file transfer",
    maven: "org.mule.connectors:mule-sftp-connector",
    namespace: "sftp"
  },
  "ibm-mq": {
    name: "IBM MQ",
    description: "IBM MQ messaging",
    maven: "com.mulesoft.connectors:mule-ibm-mq-connector",
    namespace: "ibm-mq"
  },
  "anypoint-mq": {
    name: "Anypoint MQ",
    description: "Anypoint MQ messaging",
    maven: "com.mulesoft.connectors:mule-anypoint-mq-connector",
    namespace: "anypoint-mq"
  },
  "object-store": {
    name: "Object Store",
    description: "Mule Object Store",
    maven: null,
    namespace: "os"
  }
};

function normalizeConnector(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

function resolveConnectors(values = []) {
  const selected = [...new Set(values.map(normalizeConnector).filter(Boolean))];
  const unknown = selected.filter((name) => !CONNECTORS[name]);
  if (unknown.length) throw new Error(`Unsupported connector(s): ${unknown.join(", ")}`);
  return selected.map((name) => ({ id: name, ...CONNECTORS[name] }));
}

module.exports = { CONNECTORS, normalizeConnector, resolveConnectors };
