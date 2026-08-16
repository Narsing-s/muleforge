const CONNECTORS = {
  http: { name: "HTTP", description: "HTTP Listener and Request", maven: "org.mule.connectors:mule-http-connector", namespace: "http", defaultVersion: "1.11.3" },
  database: { name: "Database", description: "Database connector", maven: "org.mule.connectors:mule-db-connector", namespace: "db", defaultVersion: "1.14.13" },
  snowflake: { name: "Snowflake", description: "Snowflake database connector", maven: "com.mulesoft.connectors:mule-snowflake-connector", namespace: "snowflake", defaultVersion: "1.0.0" },
  sftp: { name: "SFTP", description: "Secure file transfer", maven: "com.mulesoft.connectors:mule-sftp-connector", namespace: "sftp", defaultVersion: "2.5.0" },
  "ibm-mq": { name: "IBM MQ", description: "IBM MQ messaging", maven: "com.mulesoft.connectors:mule-ibm-mq-connector", namespace: "ibm-mq", defaultVersion: "1.7.0" },
  "anypoint-mq": { name: "Anypoint MQ", description: "Anypoint MQ messaging", maven: "com.mulesoft.connectors:mule-anypoint-mq-connector", namespace: "anypoint-mq", defaultVersion: "4.0.0" },
  "object-store": { name: "Object Store", description: "Mule Object Store", maven: null, namespace: "os" }
};

function normalizeConnector(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

function resolveConnectors(values = []) {
  const selected = [...new Set(values.map(normalizeConnector).filter(Boolean))];
  const unknown = selected.filter(name => !CONNECTORS[name]);
  if (unknown.length) throw new Error(`Unsupported connector(s): ${unknown.join(", ")}`);
  return selected.map(name => ({ id: name, ...CONNECTORS[name] }));
}

function buildConnectorDependencies(config = {}, versions = {}) {
  const selected = [
    "http",
    ...(config.connectors || []),
    ...(config.database && config.database.type === "snowflake" ? ["database"] : [])
  ];
  const connectors = resolveConnectors(selected);
  const dependencies = connectors.filter(c => c.maven).map(c => {
    const [groupId, artifactId] = c.maven.split(":");
    return { groupId, artifactId, version: versions[c.id] || c.defaultVersion, classifier: "mule-plugin" };
  });
  if (config.database && config.database.type === "snowflake") {
    dependencies.push({
      groupId: "net.snowflake",
      artifactId: "snowflake-jdbc",
      version: versions.snowflakeJdbc || "3.20.0",
      classifier: null
    });
  }
  return dependencies;
}

module.exports = { CONNECTORS, normalizeConnector, resolveConnectors, buildConnectorDependencies };
