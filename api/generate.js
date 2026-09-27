const MODEL = process.env.AGENTFLOW_MODEL || "openai/gpt-5.6-luna";
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";

function json(status, body) {
  return { statusCode: status, headers: {"content-type":"application/json","cache-control":"no-store"}, body: JSON.stringify(body) };
}
function cleanWorkflow(value, requirement) {
  if (!value || typeof value !== "object") throw new Error("Model returned an invalid workflow");
  const steps = Array.isArray(value.steps) ? value.steps : [];
  if (!steps.length) throw new Error("Model returned no workflow steps");
  return {
    name: typeof value.name === "string" ? value.name : "AgentFlow workflow",
    type: typeof value.type === "string" ? value.type : "Integration workflow",
    sourceRequirement: requirement, generatedAt: new Date().toISOString(),
    steps: steps.slice(0, 20).map((s,i)=>({title:String(s.title||`Step ${i+1}`),detail:String(s.detail||""),kind:String(s.kind||"Workflow")})),
    qualityGates: Array.isArray(value.qualityGates) ? value.qualityGates.slice(0,10) : []
  };
}
module.exports = async function handler(req) {
  if (req.method !== "POST") return json(405,{error:"POST required"});
  if (!process.env.AI_GATEWAY_API_KEY) return json(503,{error:"AI generation is not configured"});
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const requirement = String(body.requirement || "").trim();
    if (requirement.length < 10) return json(400,{error:"Requirement must be at least 10 characters"});
    if (requirement.length > 12000) return json(400,{error:"Requirement is too long"});
    const system = `You are AgentFlow Studio, an integration architect specializing in MuleSoft and API-led connectivity.
Convert the business requirement into a practical build-ready workflow plan.
Return ONLY valid JSON: {"name":"string","type":"string","steps":[{"title":"string","detail":"string","kind":"string"}],"qualityGates":[{"name":"string","pass":true,"reason":"string"}]}
Cover trigger, source/input, validation, transformation, idempotency where relevant, delivery/persistence, resilience, observability, testing and deployment when relevant.
Do not claim anything is deployed. Do not invent credentials, secrets, URLs, customer data, or infrastructure details. Prefer MuleSoft terminology when applicable.`;
    const response = await fetch(GATEWAY,{
      method:"POST",
      headers:{"authorization":`Bearer ${process.env.AI_GATEWAY_API_KEY}`,"content-type":"application/json"},
      body:JSON.stringify({model:MODEL,temperature:0.2,messages:[{role:"system",content:system},{role:"user",content:requirement}],response_format:{type:"json_object"}})
    });
    if(!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const payload=await response.json();
    const content=payload?.choices?.[0]?.message?.content;
    const parsed=JSON.parse(typeof content==="string"?content:JSON.stringify(content));
    return json(200,{workflow:cleanWorkflow(parsed,requirement),provider:"ai-gateway",model:MODEL});
  } catch(error) {
    return json(502,{error:"AI generation failed",detail:error instanceof Error?error.message:"Unknown error"});
  }
};
