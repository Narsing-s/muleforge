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
    namespace: "db",
    defaultVersion: "1.14.10"
  },

  snowflake: {
    name: "Snowflake",
    description: "Snowflake database connector",
    maven: "com.mulesoft.connectors:mule4-snowflake-connector",
    namespace: "snowflake",
    defaultVersion: "1.1.0"
  },

  sftp: {
    name: "SFTP",
    description: "Secure file transfer",
    maven: "org.mule.connectors:mule-sftp-connector",
    namespace: "sftp",
    defaultVersion: "2.7.0",
    minJava: "17"
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
    maven: "com.mulesoft.connectors:anypoint-mq-connector",
    namespace: "anypoint-mq",
    defaultVersion: "4.0.9"
  },

  "object-store": {
    name: "Object Store",
    description: "Mule Object Store",
    maven: "org.mule.connectors:mule-objectstore-connector",
    namespace: "os",
    defaultVersion: "1.2.2"
  }
};

function normalizeConnector(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function resolveConnectors(values = []) {
  const selected = [
    ...new Set(
      values
        .map(normalizeConnector)
        .filter(Boolean)
    )
  ];

  const unknown = selected.filter((name) => !CONNECTORS[name]);

  if (unknown.length) {
    throw new Error(
      `Unsupported connector(s): ${unknown.join(", ")}`
    );
  }

  return selected.map((name) => ({
    id: name,
    ...CONNECTORS[name]
  }));
}

function splitMavenCoordinate(coordinate) {
  if (!coordinate) return null;

  const parts = coordinate.split(":");

  if (parts.length !== 2) {
    throw new Error(`Invalid Maven coordinate: ${coordinate}`);
  }

  return {
    groupId: parts[0],
    artifactId: parts[1]
  };
}

function buildConnectorDependencies(
  config,
  connectorVersions = {}
) {
  return resolveConnectors(config.connectors || [])
    .map((connector) => {
      const coordinate = splitMavenCoordinate(connector.maven);

      // HTTP does not require a Maven connector dependency.
      if (!coordinate) return null;

      const version =
        connectorVersions[connector.id] ||
        connector.defaultVersion;

      if (!version) {
        throw new Error(
          `Missing version for connector '${connector.id}'. ` +
          `Add connectors.versions.${connector.id} to muleforge.yaml`
        );
      }

      return {
        ...coordinate,
        version
      };
    })
    .filter(Boolean);
}

module.exports = {
  CONNECTORS,
  normalizeConnector,
  resolveConnectors,
  splitMavenCoordinate,
  buildConnectorDependencies
};