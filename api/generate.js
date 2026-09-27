const MODEL=process.env.AGENTFLOW_MODEL||"openai/gpt-5.4";
const GATEWAY="https://ai-gateway.vercel.sh/v1/chat/completions";
const out=(status,body)=>({statusCode:status,headers:{"content-type":"application/json","cache-control":"no-store"},body:JSON.stringify(body)});
function workflow(v,req){if(!v||typeof v!=="object"||!Array.isArray(v.steps)||!v.steps.length)throw Error("Invalid workflow");return{name:String(v.name||"AgentFlow workflow"),type:String(v.type||"Integration workflow"),sourceRequirement:req,generatedAt:new Date().toISOString(),steps:v.steps.slice(0,20).map((s,i)=>({title:String(s.title||"Step "+(i+1)),detail:String(s.detail||""),kind:String(s.kind||"Workflow")})),qualityGates:Array.isArray(v.qualityGates)?v.qualityGates.slice(0,10):[]}}
function artifacts(a){if(!a||typeof a!=="object")throw Error("No artifacts");for(const k of ["muleXml","raml","dataWeave","configYaml","postman"])if(typeof a[k]!=="string"||!a[k].trim())throw Error("Missing artifact: "+k);const p=JSON.parse(a.postman);if(p?.info?.schema!=="https://schema.getpostman.com/json/collection/v2.1.0/collection.json")throw Error("Postman must be v2.1");return{muleXml:a.muleXml,raml:a.raml,dataWeave:a.dataWeave,configYaml:a.configYaml,postman:JSON.stringify(p,null,2)}}
module.exports=async function(req){
 if(req.method!=="POST")return out(405,{error:"POST required"});
 if(!process.env.AI_GATEWAY_API_KEY)return out(503,{error:"AI generation is not configured"});
 try{
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}),reqt=String(b.requirement||"").trim();
  if(reqt.length<10)return out(400,{error:"Requirement must be at least 10 characters"});
  if(reqt.length>12000)return out(400,{error:"Requirement is too long"});
  const system=`You are a senior MuleSoft integration architect. Return ONLY JSON:
{"workflow":{"name":"string","type":"string","steps":[{"title":"string","detail":"string","kind":"string"}],"qualityGates":[{"name":"string","pass":true,"reason":"string"}]},"artifacts":{"muleXml":"string","raml":"string","dataWeave":"string","configYaml":"string","postman":"string"}}
Create requirement-specific, internally consistent Mule 4 implementation artifacts. muleXml must be Mule 4 XML with appropriate HTTP/Scheduler/SFTP/DB/Snowflake/email connector skeletons when relevant; no credentials. raml must be RAML 1.0 and reflect API fields/path when HTTP/API is relevant. dataWeave must be real DW 2.0 mapping/validation logic, not payload passthrough. configYaml must contain environment placeholders only. postman must be valid Postman Collection v2.1 JSON string with {{baseUrl}} and relevant example requests. If API-led connectivity is requested, model System, Process and Experience boundaries. Use localhost or {{baseUrl}} placeholders only; never invent deployed URLs, secrets or customer data. Cover trigger, source, validation, transformation, idempotency, delivery/persistence, resilience, observability, testing and deployment where relevant.`;
  const r=await fetch(GATEWAY,{method:"POST",headers:{"authorization":`Bearer ${process.env.AI_GATEWAY_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({model:MODEL,temperature:.1,messages:[{role:"system",content:system},{role:"user",content:reqt}],response_format:{type:"json_object"}})});
  if(!r.ok)throw Error("AI provider returned "+r.status);
  const p=await r.json(),c=p?.choices?.[0]?.message?.content,j=JSON.parse(typeof c==="string"?c:JSON.stringify(c));
  return out(200,{workflow:workflow(j.workflow,reqt),artifacts:artifacts(j.artifacts),provider:"ai-gateway",model:MODEL});
 }catch(e){return out(502,{error:"AI generation failed",detail:e instanceof Error?e.message:"Unknown error"})}
};