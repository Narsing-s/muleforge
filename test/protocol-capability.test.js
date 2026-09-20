const assert = require("node:assert/strict");
const { detectProtocol, validateProtocolCapability } = require("../src/protocol-capability");

assert.equal(detectProtocol({ api: { specification: "RAML" } }), "rest");
assert.equal(detectProtocol({ api: { specification: "OAS" } }), "rest");
assert.equal(detectProtocol({ api: { specification: "WSDL" } }), "soap");
assert.equal(detectProtocol({ requirement: "Implement an AsyncAPI event consumer" }), "asyncapi");
assert.equal(detectProtocol({ requirement: "Expose a gRPC service using protobuf" }), "grpc");
assert.equal(detectProtocol({ requirement: "Provide OData v4 entity sets" }), "odata");
assert.equal(detectProtocol({ requirement: "Build a GraphQL API" }), "graphql");

assert.equal(validateProtocolCapability({ api: { specification: "RAML" } }).valid, true);
assert.equal(validateProtocolCapability({ api: { specification: "OAS" } }).valid, false);
assert.equal(validateProtocolCapability({ api: { specification: "WSDL" } }).valid, true);
assert.equal(detectProtocol({ requirement: "Build an OpenAPI API" }), "oas");
assert.equal(validateProtocolCapability({ requirement: "Build an AsyncAPI event API" }).valid, false);
assert.equal(validateProtocolCapability({ requirement: "Build a gRPC API" }).valid, false);
assert.equal(validateProtocolCapability({ requirement: "Build an OData API" }).valid, false);
assert.equal(validateProtocolCapability({ requirement: "Connect database and SFTP on a schedule" }).valid, true);
