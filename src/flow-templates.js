const { normalizeConnector } = require("./connectors");

function connectorFlows(connectors = [], data) {
  const selected = new Set(connectors.map(normalizeConnector));
  let xml = "";

  if (selected.has("snowflake")) {
    xml += `  <flow name="${data.artifactId}-snowflake-example-flow">\n`;
    xml += `    <http:listener config-ref="HTTP_Listener_config" path="${data.basePath}/customers" allowedMethods="GET" />\n`;
    xml += `    <logger level="INFO" message="MuleForge Snowflake example flow" />\n`;
    xml += `    <!-- Configure the Snowflake connector using your environment properties before enabling the database operation. -->\n`;
    xml += `    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n{ message: "Snowflake connector selected", status: "CONFIGURE_CONNECTION" }]]></ee:set-payload></ee:message></ee:transform>\n`;
    xml += `  </flow>\n`;
  }

  if (selected.has("database")) {
    xml += `  <flow name="${data.artifactId}-database-example-flow">\n`;
    xml += `    <http:listener config-ref="HTTP_Listener_config" path="${data.basePath}/database/health" allowedMethods="GET" />\n`;
    xml += `    <logger level="INFO" message="MuleForge Database connector selected" />\n`;
    xml += `    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n{ message: "Database connector selected", status: "CONFIGURE_CONNECTION" }]]></ee:set-payload></ee:message></ee:transform>\n`;
    xml += `  </flow>\n`;
  }

  if (selected.has("sftp")) {
    xml += `  <flow name="${data.artifactId}-sftp-example-flow">\n`;
    xml += `    <scheduler><scheduling-strategy><fixed-frequency frequency="60000" /></scheduling-strategy></scheduler>\n`;
    xml += `    <logger level="INFO" message="MuleForge SFTP example flow selected; configure SFTP connection properties before use" />\n`;
    xml += `  </flow>\n`;
  }

  if (selected.has("ibm-mq")) {
    xml += `  <!-- IBM MQ connector selected. Configure queue manager, channel and credentials using secure properties. -->\n`;
  }

  if (selected.has("anypoint-mq")) {
    xml += `  <!-- Anypoint MQ connector selected. Configure client credentials and destination using secure properties. -->\n`;
  }

  if (selected.has("object-store")) {
    xml += `  <flow name="${data.artifactId}-object-store-example-flow">\n`;
    xml += `    <http:listener config-ref="HTTP_Listener_config" path="${data.basePath}/cache" allowedMethods="GET" />\n`;
    xml += `    <logger level="INFO" message="MuleForge Object Store example flow selected" />\n`;
    xml += `    <ee:transform><ee:message><ee:set-payload><![CDATA[%dw 2.0\noutput application/json\n---\n{ message: "Object Store connector selected", status: "CONFIGURE_STORE" }]]></ee:set-payload></ee:message></ee:transform>\n`;
    xml += `  </flow>\n`;
  }

  return xml;
}

module.exports = { connectorFlows };
