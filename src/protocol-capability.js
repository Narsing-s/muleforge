const PROTOCOLS = Object.freeze({
  REST: "rest",
  ASYNCAPI: "asyncapi",
  GRPC: "grpc",
  GRAPHQL: "graphql",
  ODATA: "odata",
  SOAP: "soap"
});

const CAPABILITIES = Object.freeze({
  rest: { implemented: true, contract: ["RAML"], generator: "apikit-generator.js" },
  oas: { implemented: false, contract: ["OAS"], generator: null },
  soap: { implemented: true, contract: ["WSDL"], generator: "soap-generator.js" },
  graphql: { implemented: true, contract: ["GraphQL schema"], generator: "graphql-generator.js" },
  asyncapi: { implemented: false, contract: ["AsyncAPI"], generator: null },
  grpc: { implemented: false, contract: ["Protocol Buffers"], generator: null },
  odata: { implemented: false, contract: ["OData"], generator: null }
});

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function detectProtocol(config = {}) {
  const explicit = normalize(config.api?.protocol || config.api?.type || config.protocol || "");
  const specification = normalize(config.api?.specification || "");
  const text = [
    config.requirement,
    config.description,
    ...(Array.isArray(config.requirements) ? config.requirements.map(x => x.text || x.description || "") : [])
  ].join("\n").toLowerCase();

  if (explicit === "asyncapi" || specification === "asyncapi" || /\basyncapi\b/.test(text)) return PROTOCOLS.ASYNCAPI;
  if (explicit === "grpc" || explicit === "g-rpc" || specification === "protobuf" || /\bgrpc\b|protocol buffers?/.test(text)) return PROTOCOLS.GRPC;
  if (explicit === "odata" || /^odata/.test(specification) || /\bodata\b/.test(text)) return PROTOCOLS.ODATA;
  if (explicit === "graphql" || specification === "graphql" || /\bgraphql\b/.test(text)) return PROTOCOLS.GRAPHQL;
  if (explicit === "soap" || specification === "wsdl" || /\bsoap\b|\bwsdl\b/.test(text)) return PROTOCOLS.SOAP;
  if (explicit === "rest" || specification === "raml" || specification === "oas" || specification === "openapi") return PROTOCOLS.REST;
  return null;
}

/**
 * Prevents MuleForge from silently treating an explicitly requested protocol
 * as a different workload. Unsupported protocols are reported as blocked
 * generation requirements rather than producing misleading REST scaffolding.
 */
function validateProtocolCapability(config = {}) {
  const protocol = detectProtocol(config);
  if (!protocol) {
    return {
      version: "1.0",
      protocol: null,
      status: "not-applicable",
      valid: true,
      implemented: true,
      reason: "No explicit API protocol was detected; workload-neutral generation may continue."
    };
  }

  const capability = CAPABILITIES[protocol];
  return {
    version: "1.0",
    protocol,
    status: capability.implemented ? "supported" : "unsupported",
    valid: capability.implemented,
    implemented: capability.implemented,
    contractTypes: capability.contract,
    generator: capability.generator,
    reason: capability.implemented
      ? `${protocol} has a dedicated MuleForge generation path.`
      : `${protocol} is explicitly requested, but MuleForge does not yet have a complete end-to-end generation path for this protocol. Generation is blocked rather than silently falling back to REST.`,
    requiredNextStep: capability.implemented ? null : `Implement and verify the complete ${protocol} path before enabling verified generation.`
  };
}

module.exports = { PROTOCOLS, CAPABILITIES, detectProtocol, validateProtocolCapability };
