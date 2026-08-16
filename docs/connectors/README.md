# Connectors

Connectors are technical building blocks selected by the project requirement.

Current catalog:

- HTTP
- Database
- Snowflake
- SFTP
- IBM MQ
- Anypoint MQ
- Object Store

## Connector generation rules

1. Generate only connectors required by the confirmed design.
2. Add the appropriate Maven dependency/configuration for the selected connector.
3. Use environment or secure properties for credentials.
4. Do not generate credentials or production secrets.
5. Do not create unrelated business flows simply because a connector is available.

Connector-specific implementation documentation should be expanded as each connector generator becomes production-ready.
