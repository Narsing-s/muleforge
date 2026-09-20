function normalize(value) {
  return String(value || "").toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function layerEvidence(text) {
  const lower = normalize(text);
  const experience = hasAny(lower, [
    /experience\s+api/,
    /channel\s+api/,
    /mobile\s+api/,
    /web\s+api/,
    /customer[- ]facing\s+api/,
    /frontend\s+api/,
    /consumer\s+specific/
  ]);
  const process = hasAny(lower, [
    /process\s+api/,
    /orchestrat(?:e|ion)/,
    /business\s+process/,
    /combine(?:s|d)?\s+(?:multiple|several)\s+(?:systems|apis|sources)/,
    /aggregate(?:s|d)?\s+(?:multiple|several)/
  ]);
  const system = hasAny(lower, [
    /system\s+api/,
    /database/,
    /salesforce/,
    /sap\b/,
    /oracle/,
    /snowflake/,
    /ibm\s*mq/,
    /sftp/,
    /mainframe/,
    /backend\s+system/
  ]);
  return { experience, process, system };
}

function inferApiLedArchitecture(input = {}) {
  const text = [
    input.text,
    ...(Array.isArray(input.operations) ? input.operations.map(op => [
      op.name, op.path, op.description, op.connector, op.downstreamEndpoint
    ].join(" ")) : []),
    ...(Array.isArray(input.existingArtifacts) ? input.existingArtifacts : [])
  ].filter(Boolean).join("\n");
  const evidence = layerEvidence(text);
  const explicitLayers = [];
  const lower = normalize(text);
  if (/experience\s+api/.test(lower)) explicitLayers.push("Experience API");
  if (/process\s+api/.test(lower)) explicitLayers.push("Process API");
  if (/system\s+api/.test(lower)) explicitLayers.push("System API");

  const layers = [];
  if (evidence.experience) layers.push("Experience API");
  if (evidence.process) layers.push("Process API");
  if (evidence.system) layers.push("System API");

  if (!layers.length) {
    if (Array.isArray(input.operations) && input.operations.some(op => op.connector && normalize(op.connector) !== "http")) {
      layers.push("System API");
    } else {
      layers.push("System API");
    }
  }

  const uniqueLayers = [...new Set(layers)];
  const complete = uniqueLayers.length === 3;
  const explicit = explicitLayers.length > 0;
  const confidence = complete && explicit ? "high" : explicit ? "medium" : uniqueLayers.length === 1 ? "low" : "medium";

  const relationships = [];
  if (uniqueLayers.includes("Experience API") && uniqueLayers.includes("Process API")) {
    relationships.push({ from: "Experience API", to: "Process API", reason: "consumer/channel-specific access delegates to business orchestration" });
  }
  if (uniqueLayers.includes("Process API") && uniqueLayers.includes("System API")) {
    relationships.push({ from: "Process API", to: "System API", reason: "business orchestration delegates to system-specific capabilities" });
  }
  if (!relationships.length && uniqueLayers.includes("System API")) {
    relationships.push({ from: "Client", to: "System API", reason: "no separate Experience/Process layer was evidenced" });
  }

  const assumptions = [];
  if (!explicit) assumptions.push("No explicit API-led layer declaration was found; MuleForge inferred the minimum evidenced layer.");
  if (!uniqueLayers.includes("Experience API")) assumptions.push("No Experience API evidence was found; MuleForge will not invent a consumer-specific layer.");
  if (!uniqueLayers.includes("Process API")) assumptions.push("No Process API/orchestration evidence was found; MuleForge will not invent a business orchestration layer.");
  if (!uniqueLayers.includes("System API")) assumptions.push("No System API evidence was found; backend/system boundaries require review.");

  return {
    version: "1.0",
    style: "MuleSoft API-led connectivity",
    layers: uniqueLayers.map(name => ({ name, evidenced: true })),
    relationships,
    evidence: { explicitLayers, detected: evidence },
    confidence,
    decision: complete
      ? "Use the documented three-layer API-led structure."
      : "Use only the API-led layers supported by supplied evidence; review assumptions before generation.",
    assumptions
  };
}

module.exports = { inferApiLedArchitecture };
