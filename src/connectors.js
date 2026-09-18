const CONNECTORS = {
  http: { name: "HTTP", description: "HTTP Listener and Request", maven: "org.mule.connectors:mule-http-connector", namespace: "http", defaultVersion: "1.11.3" },
  database: { name: "Database", description: "Database connector", maven: "org.mule.connectors:mule-db-connector", namespace: "db", defaultVersion: "1.14.13" },
  snowflake: { name: "Snowflake", description: "Snowflake database connector", maven: "com.mulesoft.connectors:mule4-snowflake-connector", namespace: "snowflake", defaultVersion: "1.4.0" },
  sftp: { name: "SFTP", description: "Secure file transfer", maven: "org.mule.connectors:mule-sftp-connector", namespace: "sftp", defaultVersion: "2.5.0" },
  "ibm-mq": { name: "IBM MQ", description: "IBM MQ messaging", maven: "com.mulesoft.connectors:mule-ibm-mq-connector", namespace: "ibm-mq", defaultVersion: "1.9.0" },
  "anypoint-mq": { name: "Anypoint MQ", description: "Anypoint MQ messaging", maven: "com.mulesoft.connectors:mule-anypoint-mq-connector", namespace: "anypoint-mq", defaultVersion: "4.0.23" },
  "object-store": { name: "Object Store", description: "Mule Object Store", maven: null, namespace: "os" },
  file: { name: "File", description: "Local file operations", maven: "org.mule.connectors:mule-file-connector", namespace: "file", defaultVersion: "1.5.2" },
  email: { name: "Email", description: "SMTP/IMAP email", maven: "org.mule.connectors:mule-email-connector", namespace: "email", defaultVersion: "1.7.2" },
  jms: { name: "JMS", description: "JMS messaging", maven: "org.mule.connectors:mule-jms-connector", namespace: "jms", defaultVersion: "2.10.0" },
  kafka: { name: "Apache Kafka", description: "Kafka messaging", maven: "org.mule.connectors:mule-kafka-connector", namespace: "kafka", defaultVersion: "4.9.0" },
  salesforce: { name: "Salesforce", description: "Salesforce API integration", maven: "org.mule.connectors:mule-sfdc-connector", namespace: "sfdc", defaultVersion: "11.2.0" }
};

const ALIASES = {
  "snowflake-database": "snowflake",
  "snowflake-db": "snowflake",
  "snowflake-connector": "snowflake",
  "mysql-database": "database",
  "postgres-database": "database",
  "postgresql-database": "database",
  "oracle-database": "database",
  "db": "database",
  "mq": "anypoint-mq"
};

function normalizeConnector(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  return ALIASES[normalized] || normalized;
}

function resolveConnectors(values = []) {
  const selected = [...new Set(values.map(normalizeConnector).filter(Boolean))];
  const unknown = selected.filter(name => !CONNECTORS[name]);
  if (unknown.length) throw new Error(`Unsupported connector(s): ${unknown.join(", ")}`);
  return selected.map(name => ({ id: name, ...CONNECTORS[name] }));
}

function buildConnectorDependencies(config = {}, versions = {}) {
  const snowflake = config.database && config.database.type === "snowflake";
  const selected = ["http", ...(config.connectors || []), ...(snowflake ? ["database"] : [])];
  if (selected.some(value => normalizeConnector(value) === "snowflake")) selected.push("database");
  const connectors = resolveConnectors(selected);
  const dependencies = connectors.filter(c => c.maven).map(c => {
    const [groupId, artifactId] = c.maven.split(":");
    return { groupId, artifactId, version: versions[c.id] || c.defaultVersion, classifier: "mule-plugin" };
  });
  if (snowflake || selected.some(value => normalizeConnector(value) === "snowflake")) {
    dependencies.push({ groupId: "net.snowflake", artifactId: "snowflake-jdbc", version: versions.snowflakeJdbc || "3.18.0", classifier: null });
  }
  const dbType = String(config.database?.type || "").toLowerCase();
  const jdbcDrivers = {
    mysql: { groupId: "com.mysql", artifactId: "mysql-connector-j", version: versions.mysqlJdbc || "9.4.0" },
    postgres: { groupId: "org.postgresql", artifactId: "postgresql", version: versions.postgresJdbc || "42.7.7" },
    postgresql: { groupId: "org.postgresql", artifactId: "postgresql", version: versions.postgresJdbc || "42.7.7" },
    oracle: { groupId: "com.oracle.database.jdbc", artifactId: "ojdbc11", version: versions.oracleJdbc || "23.8.0" }
  };
  if (jdbcDrivers[dbType]) dependencies.push({ ...jdbcDrivers[dbType], classifier: null });
  return dependencies;
}

module.exports = { CONNECTORS, normalizeConnector, resolveConnectors, buildConnectorDependencies };
